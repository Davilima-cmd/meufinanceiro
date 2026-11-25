/** Identificadores de erro do Prisma (sem depender do namespace `Prisma`). */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

function codeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** `true` quando a falha é uma violação de unicidade (idempotência). */
export function isUniqueViolation(error: unknown): boolean {
  return codeOf(error) === UNIQUE_CONSTRAINT_VIOLATION;
}

/** `true` quando o registro alvo não existe mais. */
export function isRecordNotFound(error: unknown): boolean {
  return codeOf(error) === RECORD_NOT_FOUND;
}
