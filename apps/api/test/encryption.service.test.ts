import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from '../src/encryption/encryption.service';

// Chave base64 de 32 bytes (apenas para testes — nunca usar em produção).
const TEST_KEY = 'e0JIMGh0loeuwsEjq3fFCbdZIKcXsZ6RXYuJgc/Cvb8=';

function makeService(key = TEST_KEY) {
  const config = { get: () => key } as any;
  const service = new EncryptionService(config);
  service.onModuleInit();
  return service;
}

describe('EncryptionService (AES-256-GCM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should encrypt and decrypt roundtrip', () => {
    const svc = makeService();
    const plain = 'provider-account-123';
    const encrypted = svc.encrypt(plain) as string;
    expect(encrypted).not.toBe(plain);
    expect(encrypted.startsWith('enc:')).toBe(true);
    expect(svc.decrypt(encrypted)).toBe(plain);
  });

  it('should return null for null/undefined input', () => {
    const svc = makeService();
    expect(svc.encrypt(null)).toBeNull();
    expect(svc.encrypt(undefined)).toBeNull();
    expect(svc.decrypt(null)).toBeNull();
    expect(svc.decrypt(undefined)).toBeNull();
  });

  it('should produce different ciphertext on each call (random IV), same plaintext', () => {
    const svc = makeService();
    const plain = 'x';
    const once = svc.encrypt(plain) as string;
    const twice = svc.encrypt(plain) as string;
    expect(once).not.toBe(twice);
    expect(svc.decrypt(once)).toBe(plain);
    expect(svc.decrypt(twice)).toBe(plain);
  });

  it('should treat a non-prefixed value as plaintext on decrypt', () => {
    const svc = makeService();
    expect(svc.decrypt('texto-plano')).toBe('texto-plano');
  });

  it('should throw when ENCRYPTION_KEY is missing', () => {
    const config = { get: () => undefined } as any;
    const svc = new EncryptionService(config);
    expect(() => svc.onModuleInit()).toThrow(/ENCRYPTION_KEY não definida/);
  });

  it('should throw when ENCRYPTION_KEY is not 32 bytes', () => {
    const config = { get: () => Buffer.from('curta').toString('base64') } as any;
    const svc = new EncryptionService(config);
    expect(() => svc.onModuleInit()).toThrow(/32 bytes/);
  });
});

/**
 * Blind index: cifra determinística para campos buscados por igualdade.
 *
 * O AES-GCM com IV aleatório é o certo para "guardar e ler", mas quebra a busca:
 * `where: { providerAccountId: x }` comparava o texto em claro com o ciphertext
 * gravado e nunca encontrava a linha. Resultado em produção: `alreadyLinked`
 * sempre `false` e reconectar o mesmo banco duplicava conta, saldo e histórico.
 */
describe('EncryptionService — criptografia determinística', () => {
  it('o mesmo texto gera sempre o mesmo ciphertext (buscável por igualdade)', () => {
    const svc = makeService();
    const first = svc.encryptDeterministic('acc-123') as string;
    const second = svc.encryptDeterministic('acc-123') as string;

    expect(first).toBe(second);
    expect(first.startsWith('enc:')).toBe(true);
  });

  it('textos diferentes geram ciphertexts diferentes', () => {
    const svc = makeService();
    expect(svc.encryptDeterministic('acc-1')).not.toBe(svc.encryptDeterministic('acc-2'));
  });

  it('faz roundtrip e continua autenticado (GCM)', () => {
    const svc = makeService();
    const encrypted = svc.encryptDeterministic('item-abc') as string;

    expect(svc.decrypt(encrypted)).toBe('item-abc');

    // Qualquer bit alterado invalida a autenticação.
    const tampered = `enc:${Buffer.from('lixo').toString('base64')}`;
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('não vaza o texto puro no ciphertext', () => {
    const svc = makeService();
    const encrypted = svc.encryptDeterministic('saldo-secreto') as string;
    expect(encrypted).not.toContain('saldo-secreto');
  });

  it('chaves diferentes produzem ciphertexts diferentes para o mesmo texto', () => {
    const other = Buffer.alloc(32, 7).toString('base64');
    const a = makeService().encryptDeterministic('acc-1') as string;
    const b = makeService(other).encryptDeterministic('acc-1') as string;
    expect(a).not.toBe(b);
  });
});
