import { describe, expect, it } from 'vitest';
import { decimalOperand } from '../src/common/money';

describe('decimalOperand', () => {
  it('converte bigint em string de centavos inteiros', () => {
    expect(decimalOperand(-15000n)).toBe('-15000');
    expect(decimalOperand(0n)).toBe('0');
    expect(decimalOperand(9007199254740993n)).toBe('9007199254740993');
  });

  it('preserva números e strings inteiras', () => {
    expect(decimalOperand(42)).toBe('42');
    expect(decimalOperand('-7')).toBe('-7');
  });

  it('recusa valores que não são centavos inteiros', () => {
    expect(() => decimalOperand('10.5')).toThrow();
    expect(() => decimalOperand('abc')).toThrow();
  });
});
