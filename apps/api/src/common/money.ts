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

/**
 * Valor aceito por `increment`/`decrement`/`set` em colunas `Decimal` do Prisma.
 *
 * O Prisma rejeita `bigint` nesses operadores ("Expected Decimal, provided
 * BigInt"), então a aritmética do domínio pode continuar em `bigint` (sem
 * risco de precisão) e a conversão acontece só na borda do banco. A string é
 * um inteiro em centavos, formato que o Decimal do Prisma aceita.
 */
export type DecimalOperand = string | number;

export function decimalOperand(value: bigint | number | string): DecimalOperand {
  const asString = typeof value === 'bigint' ? value.toString() : String(value);
  if (!/^-?\d+$/.test(asString)) {
    throw new Error(`Valor monetário inválido para o banco: ${asString}`);
  }
  return asString;
}
