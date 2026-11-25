import { describe, expect, it } from 'vitest';
import {
  centsFromInput,
  daysUntil,
  formatBRL,
  formatCompact,
  monthBounds,
  monthRange,
  shiftMonth,
  sumCents,
  toCents,
} from '@/lib/format';

describe('centsFromInput', () => {
  it('interpreta formato brasileiro com milhar e decimais', () => {
    expect(centsFromInput('1.234,56')).toBe(123456n);
    expect(centsFromInput('R$ 1.234,56')).toBe(123456n);
  });

  it('interpreta ponto como separador decimal', () => {
    expect(centsFromInput('12.34')).toBe(1234n);
    expect(centsFromInput('0,5')).toBe(50n);
    expect(centsFromInput('40')).toBe(4000n);
  });

  it('mantém o sinal negativo', () => {
    expect(centsFromInput('-150,00')).toBe(-15000n);
    expect(centsFromInput('(25,10)')).toBe(-2510n);
  });

  it('trata entradas vazias ou inválidas como zero', () => {
    expect(centsFromInput('')).toBe(0n);
    expect(centsFromInput('abc')).toBe(0n);
    expect(centsFromInput('   ')).toBe(0n);
  });
});

describe('toCents', () => {
  it('trata texto como centavos (formato da API)', () => {
    expect(toCents('845060')).toBe(845060n);
    expect(toCents('-186430')).toBe(-186430n);
    expect(toCents('0')).toBe(0n);
  });

  it('aceita bigint e number', () => {
    expect(toCents(1234n)).toBe(1234n);
    expect(toCents(1234)).toBe(1234n);
  });
});

describe('formatBRL', () => {
  it('formata centavos positivos e negativos', () => {
    expect(formatBRL(123456n)).toBe('R$ 1.234,56');
    expect(formatBRL(-123456n)).toBe('-R$ 1.234,56');
    expect(formatBRL(0n)).toBe('R$ 0,00');
  });

  it('aceita string de centavos vinda da API', () => {
    expect(formatBRL('845060')).toBe('R$ 8.450,60');
  });

  it('formata valores compactos sem símbolo', () => {
    expect(formatCompact(123456n)).toContain('1,2');
  });
});

describe('sumCents', () => {
  it('soma valores mistos sem perder centavos', () => {
    expect(sumCents(['100', 250, 3n])).toBe(353n);
  });
});

describe('datas', () => {
  it('calcula limites do mês incluindo fevereiro bissexto', () => {
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthBounds('2026-04')).toEqual({ start: '2026-04-01', end: '2026-04-30' });
  });

  it('desloca meses atravessando o ano', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('gera a janela de meses terminando no mês informado', () => {
    expect(monthRange('2026-03', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('conta dias até uma data', () => {
    expect(daysUntil('2026-12-01', '2026-11-25')).toBe(6);
    expect(daysUntil('2026-11-25', '2026-11-25')).toBe(0);
  });
});
