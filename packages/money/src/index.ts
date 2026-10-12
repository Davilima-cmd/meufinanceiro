/**
 * Money utilities for Meu Financeiro
 * All monetary values are stored and calculated in cents (BigInt) to avoid floating-point errors
 */

export type Centavos = bigint & { readonly __brand: unique symbol };

export function centavos(value: bigint): Centavos {
  return value as Centavos;
}

export function fromReais(reais: string | number): Centavos {
  const str = String(reais).replace(',', '.');
  const isNegative = str.startsWith('-');
  const cleanStr = isNegative ? str.slice(1) : str;
  const parts = cleanStr.split('.');
  const inteiros = BigInt(parts[0] || '0');
  const decimais = parts[1] ? BigInt(parts[1].padEnd(2, '0').slice(0, 2)) : BigInt(0);
  const total = inteiros * 100n + decimais;
  return centavos(isNegative ? -total : total);
}

export function fromCentavos(centavosValue: Centavos): string {
  const valor = centavosValue < 0 ? -centavosValue : centavosValue;
  const inteiros = valor / 100n;
  const decimais = valor % 100n;
  const sinal = centavosValue < 0 ? '-' : '';
  return `${sinal}${inteiros}.${decimais.toString().padStart(2, '0')}`;
}

export function formatBRL(centavosValue: Centavos): string {
  const valor = fromCentavos(centavosValue);
  const parts = valor.split('.');
  const inteiros = parts[0] ?? '0';
  const decimais = parts[1] ?? '00';
  const sinal = inteiros.startsWith('-') ? '- ' : '';
  const inteirosAbs = inteiros.replace('-', '');
  const partes = [];
  for (let i = inteirosAbs.length; i > 0; i -= 3) {
    const inicio = Math.max(0, i - 3);
    partes.unshift(inteirosAbs.slice(inicio, i));
  }
  return `${sinal}R$ ${partes.join('.')},${decimais}`;
}

export function add(a: Centavos, b: Centavos): Centavos {
  return centavos(a + b);
}

export function subtract(a: Centavos, b: Centavos): Centavos {
  return centavos(a - b);
}

export function multiply(a: Centavos, multiplicador: number): Centavos {
  return centavos((a * BigInt(Math.round(multiplicador * 100))) / 100n);
}

export function divide(a: Centavos, divisor: number): Centavos {
  return centavos((a / BigInt(Math.round(divisor * 100))) * 100n);
}

export function isZero(value: Centavos): boolean {
  return value === 0n;
}

export function isPositive(value: Centavos): boolean {
  return value > 0n;
}

export function isNegative(value: Centavos): boolean {
  return value < 0n;
}

export function abs(value: Centavos): Centavos {
  return centavos(value < 0 ? -value : value);
}

export function compare(a: Centavos, b: Centavos): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sum(values: Centavos[]): Centavos {
  return centavos(values.reduce((acc, v) => acc + v, 0n));
}

export function average(values: Centavos[]): Centavos {
  if (values.length === 0) return centavos(0n);
  return centavos(sum(values) / BigInt(values.length));
}
