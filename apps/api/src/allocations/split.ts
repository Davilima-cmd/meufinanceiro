/**
 * Cálculo de rateio.
 *
 * O requisito do produto é que a soma das partes seja **exatamente** o valor do
 * lançamento. Dividir 100,00 em 3 dá 33,333…; qualquer arredondamento ingênuo
 * perde ou cria centavos. A regra aqui é: cada parte recebe o piso da divisão e
 * o resto (no máximo `participantes - 1` centavos) é distribuído 1 centavo por
 * vez, sempre nas primeiras partes. Assim a soma fecha, e a diferença entre a
 * maior e a menor parte nunca passa de 1 centavo.
 *
 * Tudo em centavos inteiros (`bigint`): nenhum passo usa ponto flutuante.
 */

export type SplitMode = 'equal' | 'proportional';

export type SplitInput = {
  /** Valor absoluto em centavos (o rateio não usa sinal: divide a despesa). */
  amountCents: bigint;
  participantIds: string[];
  mode?: SplitMode;
  /** Pesos/percentuais por participante (obrigatório no modo proporcional). */
  weights?: Record<string, number>;
};

export type SplitPart = { userId: string; shareCents: bigint };

export function splitAmount({
  amountCents,
  participantIds,
  mode = 'equal',
  weights,
}: SplitInput): SplitPart[] {
  if (participantIds.length === 0) {
    throw new Error('O rateio precisa de pelo menos um participante.');
  }
  const unique = [...new Set(participantIds)];
  if (unique.length !== participantIds.length) {
    throw new Error('Cada participante do rateio deve aparecer uma única vez.');
  }

  const total = amountCents < 0n ? -amountCents : amountCents;
  const count = BigInt(unique.length);

  if (mode === 'equal') {
    const base = total / count;
    const remainder = total % count;
    return unique.map((userId, index) => ({
      userId,
      // O resto vai 1 centavo por vez para as primeiras partes.
      shareCents: base + (BigInt(index) < remainder ? 1n : 0n),
    }));
  }

  // Proporcional: precisa de um peso por participante, todos positivos.
  if (!weights) {
    throw new Error('O rateio proporcional precisa de pesos por participante.');
  }
  let weightSum = 0n;
  const micro: bigint[] = [];
  for (const userId of unique) {
    const weight = weights[userId];
    if (weight === undefined || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Peso inválido para o participante ${userId}.`);
    }
    // Trabalhamos com micro-unidades para não perder precisão em percentuais
    // fracionários (ex.: 33,333%) sem recorrer a float na soma final.
    const scaled = BigInt(Math.round(weight * 1_000_000));
    weightSum += scaled;
    micro.push(scaled);
  }
  if (weightSum === 0n) {
    throw new Error('A soma dos pesos do rateio deve ser maior que zero.');
  }

  const parts: SplitPart[] = unique.map((userId, index) => ({
    userId,
    shareCents: (total * micro[index]) / weightSum,
  }));

  // O piso por participante pode ter deixado centavos de fora: distribui o
  // resto nas partes com maior resíduo (método do maior resto), mantendo a soma
  // exata e o desvio mínimo.
  const distributed = parts.reduce((sum, part) => sum + part.shareCents, 0n);
  let leftover = total - distributed;
  if (leftover > 0n) {
    const order = parts
      .map((part, index) => ({ index, remainder: (total * micro[index]) % weightSum }))
      .sort((a, b) =>
        a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1
      );
    for (const { index } of order) {
      if (leftover === 0n) break;
      parts[index].shareCents += 1n;
      leftover -= 1n;
    }
  }

  return parts;
}
