import { describe, expect, it } from 'vitest';
import { firstNameOf, greetingFor, monthHeadline, sessionLabel } from '@/lib/narrative';

describe('greetingFor', () => {
  it('cumprimenta pelo relógio, inclusive de madrugada', () => {
    expect(greetingFor(3)).toBe('Boa madrugada');
    expect(greetingFor(9)).toBe('Bom dia');
    expect(greetingFor(11)).toBe('Bom dia');
    // Meio-dia já é tarde: a faixa da manhã é [5, 12).
    expect(greetingFor(12)).toBe('Boa tarde');
    expect(greetingFor(15)).toBe('Boa tarde');
    expect(greetingFor(18)).toBe('Boa noite');
    expect(greetingFor(23)).toBe('Boa noite');
  });
});

describe('firstNameOf', () => {
  it('usa o primeiro nome e não devolve vazio', () => {
    expect(firstNameOf('Davi Lima')).toBe('Davi');
    expect(firstNameOf('  Ana ')).toBe('Ana');
    expect(firstNameOf('')).toBe('por aqui');
    expect(firstNameOf(null)).toBe('por aqui');
  });
});

describe('monthHeadline', () => {
  const base = {
    monthLabel: 'novembro',
    incomeCents: 0n,
    expenseCents: 0n,
    savingsRate: 0,
    pendingCount: 0,
  };

  it('mês vazio convida a começar, em vez de dizer que sobrou 0%', () => {
    const headline = monthHeadline(base);
    expect(headline.tone).toBe('neutral');
    expect(headline.title).toContain('em branco');
  });

  it('mês no azul cita a sobra e os pendentes', () => {
    const headline = monthHeadline({
      ...base,
      incomeCents: 500_000n,
      expenseCents: 380_000n,
      savingsRate: 24,
      pendingCount: 2,
    });
    expect(headline.tone).toBe('positive');
    expect(headline.title).toContain('24%');
    // Pendente existe: não pode parecer que o mês já fechou de vez.
    expect(headline.detail).toContain('2 lançamentos');
  });

  it('mês no vermelho aponta para as categorias', () => {
    const headline = monthHeadline({
      ...base,
      incomeCents: 300_000n,
      expenseCents: 410_000n,
      savingsRate: -37,
    });
    expect(headline.tone).toBe('negative');
    expect(headline.detail).toMatch(/categorias/i);
  });

  it('empate tem frase própria, sem porcentagem inventada', () => {
    const headline = monthHeadline({ ...base, incomeCents: 100_000n, expenseCents: 100_000n });
    expect(headline.tone).toBe('neutral');
    expect(headline.title).toContain('empatou');
  });
});

describe('sessionLabel', () => {
  it('separa demonstração de conta real', () => {
    expect(sessionLabel('api').live).toBe(true);
    expect(sessionLabel('demo').live).toBe(false);
  });
});
