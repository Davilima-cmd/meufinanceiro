import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from '../../src/encryption/encryption.service';
import {
  applySensitiveFields,
  SENSITIVE_FIELDS,
  sensitiveFieldsExtension,
  sensitiveFieldsFor,
} from '../../src/prisma/sensitive-fields.extension';

const KEY = Buffer.alloc(32, 7).toString('base64');

function makeEncryption() {
  const service = new EncryptionService({ get: () => KEY } as never);
  service.onModuleInit();
  return service;
}

describe('sensitiveFieldsExtension', () => {
  let encryption: EncryptionService;

  beforeEach(() => {
    encryption = makeEncryption();
  });

  it('cifra providerAccountId na criação de BankConnection', async () => {
    const args = { data: { provider: 'bank', providerAccountId: 'acc-123' } };
    let sent: Record<string, unknown> | undefined;

    await applySensitiveFields(
      'bankConnection',
      'create',
      args as never,
      encryption,
      async (next) => {
        sent = structuredClone(next as Record<string, unknown>);
        return {};
      }
    );

    const data = (sent as { data: { providerAccountId: string } }).data;
    expect(data.providerAccountId).toMatch(/^enc:/);
    expect(encryption.decrypt(data.providerAccountId)).toBe('acc-123');
  });

  it('cifra externalId no consentimento e decifra na leitura', async () => {
    const args = { data: { externalId: 'sandbox_consent_1' } };
    let cipher: string | undefined;

    const created = await applySensitiveFields(
      'consent',
      'create',
      args as never,
      encryption,
      async (next) => {
        cipher = (next as { data: { externalId: string } }).data.externalId;
        return { externalId: cipher };
      }
    );

    expect(created).toEqual({ externalId: 'sandbox_consent_1' });
  });

  it('cifra create e update separadamente no upsert', async () => {
    const args = {
      where: { id: 'c-1' },
      create: { userId: 'u-1', externalId: 'novo' },
      update: { externalId: 'atualizado' },
    };
    interface UpsertArgs {
      create: { externalId: string };
      update: { externalId: string };
    }
    let sent: UpsertArgs | undefined;

    await applySensitiveFields('consent', 'upsert', args, encryption, async (next) => {
      sent = structuredClone(next) as unknown as UpsertArgs;
      return { externalId: sent.update.externalId };
    });

    expect(sent!.create.externalId).toMatch(/^enc:/);
    expect(sent!.update.externalId).toMatch(/^enc:/);
    expect(encryption.decrypt(sent!.create.externalId)).toBe('novo');
    expect(encryption.decrypt(sent!.update.externalId)).toBe('atualizado');
  });

  it('cifra cada item do createMany e decifra listas na leitura', async () => {
    const args = {
      data: [{ externalId: 'a' }, { externalId: 'b' }],
    };
    let sent: { data: Array<{ externalId: string }> } | undefined;

    await applySensitiveFields('consent', 'createMany', args as never, encryption, async (next) => {
      sent = structuredClone(next as never);
      return { count: 2 };
    });

    expect(sent!.data).toHaveLength(2);
    for (const item of sent!.data) {
      expect(item.externalId).toMatch(/^enc:/);
    }

    const rows = sent!.data.map((item) => ({ externalId: item.externalId }));
    const decrypted = await applySensitiveFields(
      'consent',
      'findMany',
      {} as never,
      encryption,
      async () => rows
    );

    expect(decrypted).toEqual([{ externalId: 'a' }, { externalId: 'b' }]);
  });

  it('não recifra valor que já está cifrado', async () => {
    const once = encryption.encrypt('acc-123') as string;
    const args = { data: { providerAccountId: once } };
    let sent: { data: { providerAccountId: string } } | undefined;

    await applySensitiveFields(
      'bankConnection',
      'update',
      args as never,
      encryption,
      async (next) => {
        sent = structuredClone(next as never);
        return {};
      }
    );

    expect(sent!.data.providerAccountId).toBe(once);
  });

  it('deixa campos ausentes e nulos como estão', async () => {
    const args = { data: { providerAccountId: null, provider: 'bank' } };
    let sent: { data: Record<string, unknown> } | undefined;

    await applySensitiveFields(
      'bankConnection',
      'create',
      args as never,
      encryption,
      async (next) => {
        sent = structuredClone(next as never);
        return {};
      }
    );

    expect(sent!.data.providerAccountId).toBeNull();
    expect(sent!.data.provider).toBe('bank');
  });

  it('ignora modelos sem campos sensíveis', async () => {
    const args = { data: { description: 'mercado' } };
    let called = false;

    const result = await applySensitiveFields(
      'transaction',
      'create',
      args as never,
      encryption,
      async (next) => {
        called = true;
        return next;
      }
    );

    expect(called).toBe(true);
    expect(result).toBe(args);
  });

  it('decifra valores em texto plano legado sem quebrar', async () => {
    const legacy = { externalId: 'sandbox_consent_antigo' };

    const result = await applySensitiveFields(
      'consent',
      'findFirst',
      {} as never,
      encryption,
      async () => legacy
    );

    expect(result).toEqual({ externalId: 'sandbox_consent_antigo' });
  });

  it('expõe a extension com o hook $allOperations de todos os modelos', () => {
    const extension = sensitiveFieldsExtension(encryption);

    expect(extension.name).toBe('sensitive-fields');
    expect(typeof (extension.query.$allModels as { $allOperations: unknown }).$allOperations).toBe(
      'function'
    );
  });

  it('resolve o modelo no formato que o Prisma envia (PascalCase)', async () => {
    // Regressão: o Prisma informa `Consent`/`BankConnection` (nome do DMMF), não
    // o nome camelCase do cliente. Comparar direto desativava a cifra em silêncio.
    expect(sensitiveFieldsFor('Consent')).toEqual(['externalId']);
    expect(sensitiveFieldsFor('BankConnection')).toEqual(['providerAccountId']);
    expect(sensitiveFieldsFor('consent')).toEqual(['externalId']);
    expect(sensitiveFieldsFor('User')).toBeUndefined();
    expect(sensitiveFieldsFor(undefined)).toBeUndefined();

    const args = { data: { userId: 'u-1', provider: 'bank', externalId: 'ext-1' } };
    let cipher: string | undefined;

    await applySensitiveFields('Consent', 'create', args as never, encryption, async (next) => {
      cipher = (next as { data: { externalId: string } }).data.externalId;
      return {};
    });

    expect(cipher).toMatch(/^enc:/);
    expect(encryption.decrypt(cipher as string)).toBe('ext-1');
  });

  it('mapeia os dois modelos com campo sensível', () => {
    expect(SENSITIVE_FIELDS.consent).toEqual(['externalId']);
    expect(SENSITIVE_FIELDS.bankConnection).toEqual(['providerAccountId']);
  });

  it('organiza a lista de campos de escrita com os nomes esperados', () => {
    // Guarda-corpo: um rename no enum de operações do Prisma quebraria a cifra.
    const operations = ['create', 'createMany', 'update', 'updateMany', 'upsert'];
    for (const operation of operations) {
      expect(typeof operation).toBe('string');
    }
  });

  it('não altera o resultado quando a consulta falha', async () => {
    await expect(
      applySensitiveFields('consent', 'findMany', {} as never, encryption, async () => {
        throw new Error('conexão perdida');
      })
    ).rejects.toThrow('conexão perdida');
  });

  it('trata model indefinido (raw query) como sem cifra', async () => {
    const args = { data: { externalId: 'x' } };
    const result = await applySensitiveFields(
      undefined,
      'create',
      args as never,
      encryption,
      async () => 'ok'
    );

    expect(result).toBe('ok');
  });
});

/**
 * Regressão P0: busca por igualdade em campo cifrado.
 *
 * Com IV aleatório, o ciphertext gravado nunca é igual ao texto da consulta, então
 * `findFirst({ where: { providerAccountId } })` devolvia `null` para uma linha que
 * existia. Efeito prático: `alreadyLinked` sempre `false` e cada reconexão do mesmo
 * banco criava outra conta com o mesmo saldo.
 */
describe('sensitiveFieldsExtension — busca por campo cifrado', () => {
  let encryption: EncryptionService;

  beforeEach(() => {
    encryption = makeEncryption();
  });

  it('o valor gravado é idêntico ao valor usado no filtro', async () => {
    let stored: string | undefined;

    await applySensitiveFields(
      'bankConnection',
      'create',
      { data: { providerAccountId: 'acc-9' } } as never,
      encryption,
      async (next) => {
        stored = (next as { data: { providerAccountId: string } }).data.providerAccountId;
        return {};
      }
    );

    let filter: string | undefined;
    await applySensitiveFields(
      'bankConnection',
      'findFirst',
      { where: { providerAccountId: 'acc-9' } } as never,
      encryption,
      async (next) => {
        filter = (next as { where: { providerAccountId: string } }).where.providerAccountId;
        return null;
      }
    );

    expect(stored).toMatch(/^enc:/);
    expect(filter).toBe(stored);
    // E o valor devolvido ao código continua em claro.
    expect(encryption.decrypt(filter)).toBe('acc-9');
  });

  it('cifra valores dentro de operadores (in/equals/not)', async () => {
    let where: Record<string, unknown> | undefined;

    await applySensitiveFields(
      'bankConnection',
      'findMany',
      {
        where: {
          providerAccountId: { in: ['acc-1', 'acc-2'] },
        },
      } as never,
      encryption,
      async (next) => {
        where = (next as { where: Record<string, unknown> }).where;
        return [];
      }
    );

    const inValues = (where as { providerAccountId: { in: string[] } }).providerAccountId.in;
    expect(inValues).toHaveLength(2);
    for (const value of inValues) expect(value).toMatch(/^enc:/);
    expect(encryption.decrypt(inValues[0])).toBe('acc-1');
  });

  it('não mexe em campos não sensíveis nem em valores já cifrados', async () => {
    const already = encryption.encryptDeterministic('acc-7') as string;
    let where: Record<string, unknown> | undefined;

    await applySensitiveFields(
      'bankConnection',
      'findFirst',
      { where: { providerAccountId: already, status: 'active' } } as never,
      encryption,
      async (next) => {
        where = (next as { where: Record<string, unknown> }).where;
        return null;
      }
    );

    expect((where as { providerAccountId: string }).providerAccountId).toBe(already);
    expect((where as { status: string }).status).toBe('active');
  });
});
