const integerFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = integerFormatter.format(absolute / 100n);
  const fraction = (absolute % 100n).toString().padStart(2, '0');

  return `${negative ? '-' : ''}R$ ${whole},${fraction}`;
}

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata centavos com o padrão da moeda: `R$ 1.234,56` (aceita string da API). */
export function formatBRL(cents: bigint | string | number): string {
  const value = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(Number(cents) || 0));
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const asNumber = Number(absolute) / 100;
  return `${negative ? '-' : ''}${brlFormatter.format(asNumber)}`;
}
