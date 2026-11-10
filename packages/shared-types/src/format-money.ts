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
