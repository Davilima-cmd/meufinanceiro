/**
 * Tipos auxiliares para colunas `Json` do Prisma.
 *
 * O cliente Prisma é gerado no CI/imagem Docker (`prisma generate`). Estes
 * tipos locais evitam depender de `Prisma.InputJsonValue`/`Prisma.JsonObject`
 * em tempo de compilação e mantêm o código legível quando o cliente ainda não
 * foi gerado (ex.: `pnpm typecheck` em uma máquina sem o generate).
 */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/** Converte um objeto qualquer em JSON aceito pelas colunas `Json` do Prisma. */
export function asJson(value: unknown): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return { value: value as JsonValue };
}
