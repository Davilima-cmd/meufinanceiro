/**
 * Valores monetários são `Decimal(20,0)` no banco (centavos inteiros) e
 * strings na API. O Prisma devolve um objeto `Decimal`, que convertemos aqui.
 */
export type DecimalLike = { toString(): string };

export function centsToString(value: DecimalLike | number | string | null | undefined): string {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return value.toString();
}
