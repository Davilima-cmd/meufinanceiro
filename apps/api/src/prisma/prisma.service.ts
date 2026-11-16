import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '../encryption/encryption.service';

/**
 * Campos sensíveis que devem ser armazenados cifrados no banco.
 * O middleware do Prisma cifra na gravação e decifra na leitura, de forma
 * transparente para o restante da aplicação.
 */
const SENSITIVE_FIELDS: Record<string, string[]> = {
  Consent: ['externalId'],
  BankConnection: ['providerAccountId'],
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly encryption: EncryptionService) {
    super();
    (this as any).$use(this.encryptDecryptMiddleware.bind(this));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  private encryptDecryptMiddleware(params: any, next: any) {
    const model = params.model;
    const action = params.action;
    const sensitiveFields = SENSITIVE_FIELDS[model] ?? [];

    // Gravação: cifra os campos sensíveis antes de enviar ao banco.
    if (
      action === 'create' ||
      action === 'update' ||
      action === 'upsert' ||
      action === 'createMany' ||
      action === 'updateMany'
    ) {
      this.encryptSensitiveFields(model, params.data);
    }

    return next(params).then((result: any) => {
      // Leitura: decifra os campos sensíveis ao retornar para a aplicação.
      if (
        sensitiveFields.length > 0 &&
        (action === 'findUnique' || action === 'findFirst' || action === 'findMany')
      ) {
        if (Array.isArray(result)) {
          result.forEach((item) => this.decryptSensitiveFields(model, item));
        } else if (result && typeof result === 'object') {
          this.decryptSensitiveFields(model, result);
        }
      }
      return result;
    });
  }

  private encryptSensitiveFields(model: string, data: any): void {
    if (!data || typeof data !== 'object') {
      return;
    }

    // `update` traz os dados sob `data`; `upsert` sob `create`/`update`.
    const targets: any[] = [];
    if (data.data && typeof data.data === 'object') {
      targets.push(data.data);
    } else {
      targets.push(data);
      if (data.create && typeof data.create === 'object') {
        targets.push(data.create);
      }
      if (data.update && typeof data.update === 'object') {
        targets.push(data.update);
      }
    }

    const fields = SENSITIVE_FIELDS[model] ?? [];
    for (const target of targets) {
      for (const field of fields) {
        const value = target[field];
        if (typeof value === 'string' && !this.encryption.isEncrypted(value)) {
          target[field] = this.encryption.encrypt(value);
        }
      }
    }
  }

  private decryptSensitiveFields(model: string, item: any): void {
    if (!item || typeof item !== 'object') {
      return;
    }
    const fields = SENSITIVE_FIELDS[model] ?? [];
    for (const field of fields) {
      const value = item[field];
      if (typeof value === 'string') {
        item[field] = this.encryption.decrypt(value);
      }
    }
  }
}
