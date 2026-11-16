import { describe, expect, it } from 'vitest';
import {
  centavos,
  fromReais,
  fromCentavos,
  formatBRL,
  add,
  subtract,
  multiply,
  divide,
  isZero,
  isPositive,
  isNegative,
  abs,
  compare,
  sum,
  average,
} from './index';

describe('money utilities', () => {
  describe('fromReais', () => {
    it('converts positive reais to centavos', () => {
      expect(fromReais('10.50')).toBe(centavos(1050n));
    });

    it('converts negative reais to centavos', () => {
      expect(fromReais('-10.50')).toBe(centavos(-1050n));
    });

    it('converts zero', () => {
      expect(fromReais('0')).toBe(centavos(0n));
      expect(fromReais('0.00')).toBe(centavos(0n));
    });

    it('handles values without decimals', () => {
      expect(fromReais('100')).toBe(centavos(10000n));
    });

    it('handles single decimal digit', () => {
      expect(fromReais('10.5')).toBe(centavos(1050n));
    });

    it('handles comma as decimal separator', () => {
      expect(fromReais('10,50')).toBe(centavos(1050n));
    });

    it('handles large values', () => {
      expect(fromReais('999999999.99')).toBe(centavos(99999999999n));
    });
  });

  describe('fromCentavos', () => {
    it('converts centavos to string with two decimals', () => {
      expect(fromCentavos(centavos(1050n))).toBe('10.50');
    });

    it('converts negative centavos', () => {
      expect(fromCentavos(centavos(-1050n))).toBe('-10.50');
    });

    it('converts zero', () => {
      expect(fromCentavos(centavos(0n))).toBe('0.00');
    });

    it('handles large values', () => {
      expect(fromCentavos(centavos(99999999999n))).toBe('999999999.99');
    });
  });

  describe('formatBRL', () => {
    it('formats positive value', () => {
      expect(formatBRL(centavos(1050n))).toBe('R$ 10,50');
    });

    it('formats negative value', () => {
      expect(formatBRL(centavos(-1050n))).toBe('- R$ 10,50');
    });

    it('formats zero', () => {
      expect(formatBRL(centavos(0n))).toBe('R$ 0,00');
    });

    it('formats thousands with dots', () => {
      expect(formatBRL(centavos(1000000n))).toBe('R$ 10.000,00');
      expect(formatBRL(centavos(100000000n))).toBe('R$ 1.000.000,00');
    });

    it('formats large values', () => {
      expect(formatBRL(centavos(99999999999n))).toBe('R$ 999.999.999,99');
    });
  });

  describe('add', () => {
    it('adds two positive values', () => {
      expect(add(centavos(1000n), centavos(500n))).toBe(centavos(1500n));
    });

    it('adds positive and negative', () => {
      expect(add(centavos(1000n), centavos(-500n))).toBe(centavos(500n));
    });

    it('adds two negative values', () => {
      expect(add(centavos(-1000n), centavos(-500n))).toBe(centavos(-1500n));
    });

    it('adds zero', () => {
      expect(add(centavos(1000n), centavos(0n))).toBe(centavos(1000n));
    });
  });

  describe('subtract', () => {
    it('subtracts smaller from larger', () => {
      expect(subtract(centavos(1000n), centavos(300n))).toBe(centavos(700n));
    });

    it('subtracts larger from smaller', () => {
      expect(subtract(centavos(300n), centavos(1000n))).toBe(centavos(-700n));
    });

    it('subtracts zero', () => {
      expect(subtract(centavos(1000n), centavos(0n))).toBe(centavos(1000n));
    });
  });

  describe('multiply', () => {
    it('multiplies by integer', () => {
      expect(multiply(centavos(1000n), 2)).toBe(centavos(2000n));
    });

    it('multiplies by decimal', () => {
      expect(multiply(centavos(1000n), 1.5)).toBe(centavos(1500n));
    });

    it('multiplies by zero', () => {
      expect(multiply(centavos(1000n), 0)).toBe(centavos(0n));
    });
  });

  describe('divide', () => {
    it('divides by integer', () => {
      expect(divide(centavos(1000n), 2)).toBe(centavos(500n));
    });

    it('divides by decimal', () => {
      expect(divide(centavos(1000n), 0.5)).toBe(centavos(2000n));
    });
  });

  describe('isZero', () => {
    it('returns true for zero', () => {
      expect(isZero(centavos(0n))).toBe(true);
    });

    it('returns false for positive', () => {
      expect(isZero(centavos(1n))).toBe(false);
    });

    it('returns false for negative', () => {
      expect(isZero(centavos(-1n))).toBe(false);
    });
  });

  describe('isPositive', () => {
    it('returns true for positive', () => {
      expect(isPositive(centavos(1n))).toBe(true);
    });

    it('returns false for zero', () => {
      expect(isPositive(centavos(0n))).toBe(false);
    });

    it('returns false for negative', () => {
      expect(isPositive(centavos(-1n))).toBe(false);
    });
  });

  describe('isNegative', () => {
    it('returns true for negative', () => {
      expect(isNegative(centavos(-1n))).toBe(true);
    });

    it('returns false for zero', () => {
      expect(isNegative(centavos(0n))).toBe(false);
    });

    it('returns false for positive', () => {
      expect(isNegative(centavos(1n))).toBe(false);
    });
  });

  describe('abs', () => {
    it('returns positive for positive', () => {
      expect(abs(centavos(1000n))).toBe(centavos(1000n));
    });

    it('returns positive for negative', () => {
      expect(abs(centavos(-1000n))).toBe(centavos(1000n));
    });

    it('returns zero for zero', () => {
      expect(abs(centavos(0n))).toBe(centavos(0n));
    });
  });

  describe('compare', () => {
    it('returns -1 when a < b', () => {
      expect(compare(centavos(100n), centavos(200n))).toBe(-1);
    });

    it('returns 0 when a == b', () => {
      expect(compare(centavos(100n), centavos(100n))).toBe(0);
    });

    it('returns 1 when a > b', () => {
      expect(compare(centavos(200n), centavos(100n))).toBe(1);
    });
  });

  describe('sum', () => {
    it('sums array of values', () => {
      expect(sum([centavos(100n), centavos(200n), centavos(300n)])).toBe(centavos(600n));
    });

    it('sums with negatives', () => {
      expect(sum([centavos(1000n), centavos(-300n), centavos(-200n)])).toBe(centavos(500n));
    });

    it('returns zero for empty array', () => {
      expect(sum([])).toBe(centavos(0n));
    });
  });

  describe('average', () => {
    it('calculates average', () => {
      expect(average([centavos(100n), centavos(200n), centavos(300n)])).toBe(centavos(200n));
    });

    it('returns zero for empty array', () => {
      expect(average([])).toBe(centavos(0n));
    });
  });
});
