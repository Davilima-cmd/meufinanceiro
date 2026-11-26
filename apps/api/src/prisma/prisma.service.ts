import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '../encryption/encryption.service';

/**
 * Cliente Prisma da aplicação.
 *
 * Os campos sensíveis (`Consent.externalId`, `BankConnection.providerAccountId`)
 * são cifrados em repouso. O Prisma 6 removeu o middleware global (`$use`), e um
 * middleware silenciosamente inativo deixaria esses campos em texto plano, então
 * a cifragem passa a ser explícita: quem escreve/lê esses campos usa
 * `encryptSensitive`/`decryptSensitive`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly encryption: EncryptionService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Cifra um campo sensível antes de gravá-lo no banco. */
  encryptSensitive(value: string | null | undefined): string | null {
    return this.encryption.encrypt(value);
  }

  /** Decifra um campo sensível lido do banco (texto plano passa direto). */
  decryptSensitive(value: string | null | undefined): string | null {
    return this.encryption.decrypt(value);
  }
}
