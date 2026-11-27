/** Utilitários de formatação de dinheiro e datas (pt-BR, fuso America/Bahia). */

const TIME_ZONE = 'America/Bahia';

const integerFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Converte o texto digitado pelo usuário em centavos.
 *
 * Regra explícita, porque digitação livre é ambígua:
 * - aceita separador de milhar (`.`) e decimal (`,` ou `.`);
 * - o **último** separador é decimal quando tem 1 ou 2 dígitos depois dele;
 *   com 3+ dígitos é milhar — exceto 3 dígitos depois de vírgula, que é
 *   decimal a truncar ("1,239" = R$ 1,23), porque no Brasil `.` é o milhar;
 * - mais de 2 dígitos decimais são truncados, não arredondados: o usuário vê o
 *   valor que digitou, sem centavo inventado;
 * - `-` na frente ou valor entre parênteses = negativo;
 * - o resultado é limitado ao intervalo da coluna `Decimal(20,0)`: sem isso uma
 *   digitação longa ou colada estourava o banco (erro 500 ao criar o
 *   lançamento).
 */
export const MAX_AMOUNT_CENTS = 9_999_999_999_999_999_999n;

export function centsFromInput(input: string): bigint {
  const raw = input.trim();
  if (!raw) return 0n;

  const negative = raw.startsWith('-') || raw.startsWith('(');
  // Só dígitos, `.` e `,`: "R$", espaços e letras ("12 reais") saem fora.
  const cents = parseAmount(raw.replace(/[^\d.,]/g, ''));
  if (cents === null) return 0n;

  const signed = negative ? -cents : cents;
  if (signed > MAX_AMOUNT_CENTS) return MAX_AMOUNT_CENTS;
  if (signed < -MAX_AMOUNT_CENTS) return -MAX_AMOUNT_CENTS;
  return signed;
}

/** Núcleo da conversão. `null` quando não há nenhum dígito aproveitável. */
function parseAmount(value: string): bigint | null {
  if (!value) return null;

  const lastIndex = Math.max(value.lastIndexOf(','), value.lastIndexOf('.'));
  let whole = value;
  let fraction = '';

  if (lastIndex >= 0) {
    const tail = value.slice(lastIndex + 1).replace(/[.,]/g, '');
    const isComma = value[lastIndex] === ',';
    if (tail.length === 0) {
      // "1.234." — separador solto no fim: fica só o inteiro.
      whole = value.slice(0, lastIndex);
    } else if (tail.length <= 2 || (isComma && tail.length === 3)) {
      whole = value.slice(0, lastIndex);
      fraction = tail;
    }
    // Qualquer outro caso (3+ dígitos depois de ponto, vários pontos) é
    // milhar: os separadores saem e o número fica inteiro.
  }

  const wholeDigits = whole.replace(/\D/g, '');
  fraction = fraction.replace(/\D/g, '').slice(0, 2).padEnd(2, '0');
  if (!wholeDigits && fraction === '00') return null;

  return BigInt(wholeDigits || '0') * 100n + BigInt(fraction);
}

/**
 * Converte um valor monetário já em centavos (API, estado interno, fixtures)
 * para bigint. Texto é sempre interpretado como centavos: "1234" = R$ 12,34,
 * o que evita leituras ambíguas de separador decimal. Para texto digitado pelo
 * usuário use `centsFromInput`.
 */
/**
 * Converte um valor monetário já em centavos (API, estado interno, fixtures)
 * para bigint. Texto é sempre interpretado como centavos: "1234" = R$ 12,34,
 * o que evita leituras ambíguas de separador decimal. Para texto digitado pelo
 * usuário use `centsFromInput`.
 */
export function toCents(input: string | number | bigint): bigint {
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number') return BigInt(Math.round(input));
  const raw = input.trim();
  if (!raw) return 0n;
  try {
    return BigInt(raw.replace(/[^\d-]/g, '') || '0');
  } catch {
    return 0n;
  }
}

/** Formata centavos como "R$ 1.234,56". */
export function formatBRL(cents: bigint | string | number): string {
  const value = typeof cents === 'bigint' ? cents : toCents(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}R$ ${integerFormatter.format(Number(whole))},${fraction}`;
}

/** Formata centavos sem o símbolo, útil em tabelas. */
export function formatAmount(cents: bigint | string | number): string {
  return formatBRL(cents).replace('R$ ', '');
}

/** "R$ 1,2 mil" — usado em eixos de gráfico. */
export function formatCompact(cents: bigint | string | number): string {
  const value = typeof cents === 'bigint' ? cents : toCents(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const reais = Number(absolute) / 100;
  return `${negative ? '-' : ''}${compactFormatter.format(reais)}`;
}

export function sumCents(values: Array<bigint | string | number>): bigint {
  return values.reduce<bigint>((total, value) => total + toCents(value), 0n);
}

/** Data de hoje (YYYY-MM-DD) no fuso da Bahia. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

/** Mês atual no formato YYYY-MM. */
export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const shortMonthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const dayFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

function dateFromISO(isoDate: string): Date {
  // Datas puras são ancoradas ao meio-dia UTC para não "voltar" um dia no fuso local.
  return new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
}

/** "novembro de 2026" */
export function formatMonth(monthKey: string): string {
  return monthFormatter.format(dateFromISO(`${monthKey}-01`));
}

/** "nov" */
export function formatMonthShort(monthKey: string): string {
  return shortMonthFormatter.format(dateFromISO(`${monthKey}-01`)).replace('.', '');
}

/** "10 de nov" */
export function formatDay(isoDate: string): string {
  return dayFormatter.format(dateFromISO(isoDate)).replace('.', '');
}

/** "Hoje", "Ontem" ou "10 de nov" */
export function formatRelativeDay(isoDate: string, today = todayISO()): string {
  if (isoDate.slice(0, 10) === today) return 'Hoje';
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);
  if (isoDate.slice(0, 10) === yesterdayISO) return 'Ontem';
  return formatDay(isoDate);
}

/** Lista de meses (YYYY-MM) de `count` meses atrás até `endMonth`, inclusive. */
export function monthRange(endMonth: string, count: number): string[] {
  const [year, month] = endMonth.split('-').map(Number);
  const months: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

export function daysUntil(isoDate: string, today = todayISO()): number {
  const diff = dateFromISO(isoDate).getTime() - dateFromISO(today).getTime();
  return Math.round(diff / 86_400_000);
}

export function percentOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Math.min(100, Math.round((Number(part) / Number(total)) * 100));
}

export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
