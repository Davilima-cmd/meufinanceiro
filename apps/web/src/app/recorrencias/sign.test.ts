import { describe, expect, it } from 'vitest';
import { signedRecurrenceAmount } from './page';

/**
 * Convenção de sinal da recorrência.
 *
 * A API valida: `expense` precisa chegar negativo e `income` positivo, senão
 * responde 400 ("Despesa deve ter valor negativo"). A tela pede o valor sempre
 * positivo, então o sinal é aplicado aqui — errar isso impede criar a
 * recorrência, e o erro só aparece no momento de salvar.
 */
describe('signedRecurrenceAmount', () => {
  it('despesa é negativa e receita é positiva', () => {
    expect(signedRecurrenceAmount('expense', 150000n)).toBe(-150000n);
    expect(signedRecurrenceAmount('income', 500000n)).toBe(500000n);
  });

  it('não inverte o sinal quando a pessoa digita negativo', () => {
    expect(signedRecurrenceAmount('expense', -150000n)).toBe(-150000n);
    expect(signedRecurrenceAmount('income', -500000n)).toBe(500000n);
  });

  it('zero continua zero (a API recusa, mas sem sinal inventado)', () => {
    expect(signedRecurrenceAmount('expense', 0n)).toBe(0n);
  });
});
