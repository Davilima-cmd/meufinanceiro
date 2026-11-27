import { describe, expect, it } from 'vitest';
import { resolveMaxBodyBytes } from '../src/bootstrap';

/**
 * Limite de corpo da API.
 *
 * `Number(process.env.MAX_BODY_BYTES)` transformava `''` em `0` e `'1mb'` em
 * `NaN`. Os dois eram repassados ao body parser: `limit: NaN` faz a comparação
 * `bytes > limit` ser sempre falsa — ou seja, **o limite desaparece** e um
 * payload de dezenas de MB é carregado em memória. Isso é DoS de graça.
 */
describe('resolveMaxBodyBytes', () => {
  it('usa 1 MB quando nada está configurado', () => {
    expect(resolveMaxBodyBytes(undefined)).toBe(1_000_000);
    expect(resolveMaxBodyBytes('')).toBe(1_000_000);
    expect(resolveMaxBodyBytes('   ')).toBe(1_000_000);
  });

  it('respeita um limite válido', () => {
    expect(resolveMaxBodyBytes('2000000')).toBe(2_000_000);
    expect(resolveMaxBodyBytes('512000')).toBe(512_000);
  });

  it('nunca devolve NaN, 0 ou negativo (o que desligaria a proteção)', () => {
    for (const raw of ['1mb', 'abc', 'NaN', '0', '-5', 'Infinity', '1e999']) {
      const value = resolveMaxBodyBytes(raw);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('arredonda frações para inteiro', () => {
    expect(resolveMaxBodyBytes('1500.9')).toBe(1500);
  });
});
