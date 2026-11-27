import { describe, expect, it } from 'vitest';
import {
  MAX_AMOUNT_CENTS,
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

  it('trata ponto com 3 dígitos como milhar', () => {
    expect(centsFromInput('1.234')).toBe(123400n);
    expect(centsFromInput('1.234.567')).toBe(123456700n);
  });

  it('vírgula é sempre decimal: 3 dígitos truncam, não inflam mil vezes', () => {
    // Em pt-BR a vírgula é decimal e o ponto é milhar. Se sobrarem 3 dígitos
    // depois da vírgula, truncar perde centavos; ler como milhar multiplicaria
    // por mil. O erro pequeno é o aceitável.
    expect(centsFromInput('1,239')).toBe(123n);
    expect(centsFromInput('1,234')).toBe(123n);
    expect(centsFromInput('1,2')).toBe(120n);
    expect(centsFromInput('1,20')).toBe(120n);
  });

  it('separa milhar e decimal pelo último separador', () => {
    expect(centsFromInput('1.234,56')).toBe(123456n);
    expect(centsFromInput('1,234.56')).toBe(123456n);
  });

  it('não perde o valor quando a parte decimal tem 4+ dígitos (regressão)', () => {
    // Antes "1.2345" virava R$ 1,23 — mil vezes menor, sem aviso nenhum.
    expect(centsFromInput('1.2345')).toBe(1234500n);
    expect(centsFromInput('12.3456')).toBe(12345600n);
  });

  it('limita ao intervalo da coluna Decimal(20,0)', () => {
    const huge = '999999999999999999999999';
    expect(centsFromInput(huge)).toBe(MAX_AMOUNT_CENTS);
    expect(centsFromInput(huge).toString().length).toBe(19);
  });

  it('ignora texto colado em volta do número', () => {
    expect(centsFromInput('R$ 1.000')).toBe(100000n);
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
