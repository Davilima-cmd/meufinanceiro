import { describe, expect, it } from 'vitest';
import { splitAmount } from '../src/allocations/split';

/**
 * Rateio: a soma das partes tem de fechar **exatamente** com o valor.
 *
 * O caso que quebra implementação ingênua é 100,00 em 3: 3333 + 3333 + 3333
 * perde um centavo, e o "resto" nunca pode simplesmente desaparecer.
 */
const sum = (parts: Array<{ shareCents: bigint }>) =>
  parts.reduce((total, part) => total + part.shareCents, 0n);

describe('splitAmount — igualitário', () => {
  it('divide exatamente quando não há resto', () => {
    const parts = splitAmount({ amountCents: 10000n, participantIds: ['a', 'b'] });

    expect(parts).toEqual([
      { userId: 'a', shareCents: 5000n },
      { userId: 'b', shareCents: 5000n },
    ]);
  });

  it('distribui o resto em centavos e fecha a soma (100,00 em 3)', () => {
    const parts = splitAmount({ amountCents: 10000n, participantIds: ['a', 'b', 'c'] });

    expect(sum(parts)).toBe(10000n);
    // Diferença máxima entre partes é de 1 centavo.
    expect(parts.map((part) => part.shareCents)).toEqual([3334n, 3333n, 3333n]);
  });

  it('funciona com valor negativo (despesa) usando o absoluto', () => {
    const parts = splitAmount({ amountCents: -9999n, participantIds: ['a', 'b'] });

    expect(sum(parts)).toBe(9999n);
    expect(parts[0].shareCents).toBe(5000n);
  });

  it('um único participante recebe o valor inteiro', () => {
    expect(splitAmount({ amountCents: 7777n, participantIds: ['a'] })).toEqual([
      { userId: 'a', shareCents: 7777n },
    ]);
  });

  it('valor zero gera partes zeradas', () => {
    const parts = splitAmount({ amountCents: 0n, participantIds: ['a', 'b'] });

    expect(sum(parts)).toBe(0n);
  });

  it('recusa lista vazia e participante repetido', () => {
    expect(() => splitAmount({ amountCents: 100n, participantIds: [] })).toThrow(/participante/i);
    expect(() => splitAmount({ amountCents: 100n, participantIds: ['a', 'a'] })).toThrow(/única/i);
  });
});

describe('splitAmount — proporcional', () => {
  it('divide por peso e fecha a soma', () => {
    const parts = splitAmount({
      amountCents: 10000n,
      participantIds: ['a', 'b'],
      mode: 'proportional',
      weights: { a: 70, b: 30 },
    });

    expect(parts).toEqual([
      { userId: 'a', shareCents: 7000n },
      { userId: 'b', shareCents: 3000n },
    ]);
  });

  it('percentual quebrado (33/33/34) fecha exatamente', () => {
    const parts = splitAmount({
      amountCents: 10000n,
      participantIds: ['a', 'b', 'c'],
      mode: 'proportional',
      weights: { a: 33.33, b: 33.33, c: 33.34 },
    });

    expect(sum(parts)).toBe(10000n);
    expect(parts[2].shareCents).toBe(3334n);
  });

  it('o maior resto recebe o centavo que sobra', () => {
    const parts = splitAmount({
      amountCents: 100n,
      participantIds: ['a', 'b'],
      mode: 'proportional',
      weights: { a: 1, b: 2 },
    });

    expect(sum(parts)).toBe(100n);
    // 33,33 e 66,66 → o centavo restante vai para a maior parte.
    expect(parts[0].shareCents).toBe(33n);
    expect(parts[1].shareCents).toBe(67n);
  });

  it('recusa pesos ausentes, inválidos ou todos zero', () => {
    expect(() =>
      splitAmount({ amountCents: 100n, participantIds: ['a', 'b'], mode: 'proportional' })
    ).toThrow(/pesos/i);

    expect(() =>
      splitAmount({
        amountCents: 100n,
        participantIds: ['a', 'b'],
        mode: 'proportional',
        weights: { a: 1 },
      })
    ).toThrow(/peso inválido/i);

    // Peso zero é inválido antes mesmo da soma: cada participante precisa de
    // uma fatia explícita.
    expect(() =>
      splitAmount({
        amountCents: 100n,
        participantIds: ['a', 'b'],
        mode: 'proportional',
        weights: { a: 0, b: 0 },
      })
    ).toThrow(/peso inválido/i);
  });

  it('nunca perde centavos em valores grandes', () => {
    const parts = splitAmount({
      amountCents: 999_999_999n,
      participantIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      mode: 'proportional',
      weights: { a: 11, b: 13, c: 17, d: 19, e: 23, f: 29, g: 31 },
    });

    expect(sum(parts)).toBe(999_999_999n);
  });
});
