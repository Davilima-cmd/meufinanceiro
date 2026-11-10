import { describe, expect, it } from 'vitest';
import { formatCents } from '../src/format-money';

describe('formatCents', () => {
  it('formats Brazilian reais without converting the BigInt amount to a float', () => {
    expect(formatCents(123456n)).toBe('R$ 1.234,56');
    expect(formatCents(0n)).toBe('R$ 0,00');
    expect(formatCents(-1n)).toBe('-R$ 0,01');
  });

  it('preserves precision for amounts larger than Number.MAX_SAFE_INTEGER', () => {
    expect(formatCents(900719925474099321n)).toBe('R$ 9.007.199.254.740.993,21');
  });
});
