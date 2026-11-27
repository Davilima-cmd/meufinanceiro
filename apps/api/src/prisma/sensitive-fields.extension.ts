import { EncryptionService } from '../encryption/encryption.service';

/**
 * Campos que ficam cifrados em repouso no banco.
 *
 * A cifragem é feita por uma Client Extension do Prisma (ver
 * `sensitive-fields.extension.ts`): o middleware `$use` que fazia isso foi
 * removido no Prisma 6.14, e um middleware inativo deixaria estes campos em
 * texto plano sem ninguém notar.
 */
export const SENSITIVE_FIELDS: Record<string, readonly string[]> = {
  consent: ['externalId'],
  bankConnection: ['providerAccountId'],
};

/**
 * Campos que precisam de criptografia **determinística**.
 *
 * São os que o código consulta por igualdade (`where: { providerAccountId }`).
 * Com IV aleatório o ciphertext muda a cada escrita e a busca nunca encontra a
 * linha, o que duplicava conta bancária a cada reconexão.
 */
export const DETERMINISTIC_FIELDS: Record<string, readonly string[]> = {
  bankConnection: ['providerAccountId'],
};

/**
 * `where` e `orderBy` também carregam o valor em claro: a busca precisa do
 * mesmo ciphertext gravado, então ciframos o filtro igual aos dados.
 */
function encryptFilter(
  payload: unknown,
  fields: readonly string[],
  encryption: EncryptionService
): void {
  if (Array.isArray(payload)) {
    for (const item of payload) encryptFilter(item, fields, encryption);
    return;
  }
  if (!isPlainObject(payload)) return;

  for (const field of fields) {
    const value = payload[field];
    if (typeof value === 'string' && !encryption.isEncrypted(value)) {
      payload[field] = encryption.encryptDeterministic(value);
    } else if (isPlainObject(value)) {
      // `{ in: [...] }`, `{ equals: x }`, `{ not: x }`
      for (const [operator, inner] of Object.entries(value)) {
        if (typeof inner === 'string') {
          value[operator] = encryption.encryptDeterministic(inner);
        } else if (Array.isArray(inner)) {
          value[operator] = inner.map((item) =>
            typeof item === 'string' ? encryption.encryptDeterministic(item) : item
          );
        }
      }
    }
  }
}

/** Consulta por igualdade sobre campo cifrado pode usar versões antigas. */
const READ_OPERATIONS_WITH_ENCRYPTED_FILTER = new Set([
  'findFirst',
  'findMany',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/**
 * Resolve os campos sensíveis de um modelo.
 *
 * O Prisma informa o nome do modelo em PascalCase (`Consent`, `BankConnection`) —
 * o nome do DMMF, não o do cliente —, então a busca é case-insensitive. Comparar
 * direto com a chave em camelCase deixaria a cifragem inativa sem erro nenhum.
 */
export function sensitiveFieldsFor(model: string | undefined): readonly string[] | undefined {
  if (!model) return undefined;
  const key = Object.keys(SENSITIVE_FIELDS).find(
    (candidate) => candidate.toLowerCase() === model.toLowerCase()
  );
  return key ? SENSITIVE_FIELDS[key] : undefined;
}

/** Campos com cifra determinística (buscáveis por igualdade) de um modelo. */
export function deterministicFieldsFor(model: string | undefined): readonly string[] | undefined {
  if (!model) return undefined;
  const key = Object.keys(DETERMINISTIC_FIELDS).find(
    (candidate) => candidate.toLowerCase() === model.toLowerCase()
  );
  return key ? DETERMINISTIC_FIELDS[key] : undefined;
}

/** Operações em que os dados de entrada precisam ser cifrados antes do banco. */
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert']);

interface QueryArgs {
  data?: unknown;
  create?: unknown;
  update?: unknown;
  where?: unknown;
  [key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Cifra os campos sensíveis de um conjunto de dados de escrita.
 *
 * `upsert` separa os valores em `create`/`update`, e `createMany` aceita tanto
 * um objeto único quanto uma lista — por isso a função percorre os três
 * formatos em vez de assumir `data` como objeto plano.
 */
function encryptPayload(
  payload: unknown,
  fields: readonly string[],
  deterministic: readonly string[],
  encryption: EncryptionService
): void {
  const targets: unknown[] = [];

  if (Array.isArray(payload)) {
    targets.push(...payload);
  } else if (isPlainObject(payload)) {
    if ('data' in payload && (isPlainObject(payload.data) || Array.isArray(payload.data))) {
      targets.push(...(Array.isArray(payload.data) ? payload.data : [payload.data]));
    }
    for (const key of ['create', 'update']) {
      const nested = payload[key];
      if (isPlainObject(nested)) targets.push(nested);
      if (Array.isArray(nested)) targets.push(...nested);
    }
    targets.push(payload);
  }

  for (const target of targets) {
    if (!isPlainObject(target)) continue;
    for (const field of fields) {
      const value = target[field];
      if (typeof value === 'string' && !encryption.isEncrypted(value)) {
        target[field] = deterministic.includes(field)
          ? encryption.encryptDeterministic(value)
          : encryption.encrypt(value);
      }
    }
  }
}

/** Decifra os campos sensíveis de um ou vários registros lidos do banco. */
function decryptResult(result: unknown, fields: readonly string[], encryption: EncryptionService) {
  const targets = Array.isArray(result) ? result : [result];

  for (const target of targets) {
    if (!isPlainObject(target)) continue;
    for (const field of fields) {
      const value = target[field];
      if (typeof value === 'string' && encryption.isEncrypted(value)) {
        target[field] = encryption.decrypt(value);
      }
    }
  }

  return result;
}

/** Executa a cifragem/decifragem para uma operação e modelo. */
export async function applySensitiveFields<Result>(
  model: string | undefined,
  operation: string,
  args: QueryArgs,
  encryption: EncryptionService,
  run: (args: QueryArgs) => Promise<Result>
): Promise<Result> {
  const fields = sensitiveFieldsFor(model);
  if (!fields) {
    return run(args);
  }

  const deterministic = deterministicFieldsFor(model) ?? [];

  if (WRITE_OPERATIONS.has(operation)) {
    encryptPayload(args.data, fields, deterministic, encryption);
    if (args.create !== undefined) encryptPayload(args.create, fields, deterministic, encryption);
    if (args.update !== undefined) encryptPayload(args.update, fields, deterministic, encryption);
  }

  /**
   * Antes o `where` seguia em claro para um campo cifrado: toda consulta por
   * `providerAccountId` devolvia `null`, mesmo com a linha gravada.
   */
  if (deterministic.length > 0 && READ_OPERATIONS_WITH_ENCRYPTED_FILTER.has(operation)) {
    encryptFilter(args.where, deterministic, encryption);
  }

  return decryptResult(await run(args), fields, encryption) as Result;
}

/**
 * Client Extension que cifra na escrita e decifra na leitura dos campos
 * sensíveis, para todos os modelos e operações.
 *
 * É a substituta oficial do middleware `$use`. `$allOperations` cobre os
 * modelos listados em `SENSITIVE_FIELDS`; os demais passam direto, sem custo.
 */
export function sensitiveFieldsExtension(encryption: EncryptionService) {
  return {
    name: 'sensitive-fields',
    query: {
      $allModels: {
        async $allOperations(options: any) {
          const { model, operation, args, query } = options;
          return applySensitiveFields(
            model,
            operation,
            (args ?? {}) as QueryArgs,
            encryption,
            (nextArgs) => query(nextArgs)
          );
        },
      },
    },
  };
}
