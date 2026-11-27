import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

/**
 * Criptografia simétrica AES-256-GCM para campos sensíveis do banco.
 *
 * Formato de saída (sempre com prefixo `enc:` para evitar dupla criptografia):
 *   enc:<base64(iv(12) || authTag(16) || ciphertext)>
 *
 * A chave deve ser 32 bytes (256 bits) codificada em base64, definida via
 * variável de ambiente ENCRYPTION_KEY.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('ENCRYPTION_KEY');
    if (!raw) {
      throw new Error(
        'ENCRYPTION_KEY não definida. Adicione uma chave base64 de 32 bytes ao .env (veja .env.example).'
      );
    }
    this.key = Buffer.from(raw, 'base64');
    if (this.key.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY deve ter 32 bytes (256 bits) quando decodificada do base64. Atual: ${this.key.length} bytes.`
      );
    }
  }

  /** Criptografa um texto puro. Retorna nulo se a entrada for nula/undefined. */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined) {
      return null;
    }
    const text = String(plaintext);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
  }

  /**
   * Criptografia **determinística** (blind index) para campos que precisam ser
   * buscados por igualdade no banco.
   *
   * O AES-GCM normal usa IV aleatório: o mesmo texto gera ciphertexts
   * diferentes, então `where: { providerAccountId: 'abc' }` **nunca casa** com
   * nada gravado. Era exatamente o que acontecia com `BankConnection`:
   * `alreadyLinked` era sempre `false` e reconectar o mesmo banco criava a
   * conta e o vínculo de novo, duplicando saldo e histórico.
   *
   * Aqui o IV é derivado do próprio texto (`HMAC-SHA256(chave, texto)`), então
   * o mesmo valor produz sempre o mesmo `enc:`. O que se abre mão é a
   * propriedade de esconder igualdade — que é justamente a que a busca exige;
   * o conteúdo continua cifrado com GCM e autenticado.
   */
  encryptDeterministic(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined) return null;
    const text = String(plaintext);
    const iv = createHmac('sha256', this.key)
      .update(`blind-index:${text}`)
      .digest()
      .subarray(0, 12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
  }

  /** Descriptografa um valor no formato `enc:<base64>`. Retorna o valor original se já não estiver criptografado. */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (ciphertext === null || ciphertext === undefined) {
      return null;
    }
    const text = String(ciphertext);
    if (!text.startsWith('enc:')) {
      // Já está em texto plano (ex.: dado gravado antes da criptografia).
      return text;
    }
    const buf = Buffer.from(text.slice(4), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  /** Indica se um valor já está no formato criptografado. */
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith('enc:');
  }
}
