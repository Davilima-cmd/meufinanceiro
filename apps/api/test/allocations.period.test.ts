import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { parsePeriod } from '../src/allocations/allocations.controller';

/**
 * Intervalo de competência de `GET /allocations/summary`.
 *
 * Antes, `new Date('qualquer coisa')` ia direto para a consulta: texto inválido
 * virava `Invalid Date` (500 no Prisma) e `?to=2026-11-30T10:00:00` comparava
 * com `lte` no meio do dia, deixando de fora o rateio do próprio dia 30.
 */
const NOW = new Date(2026, 10, 15, 12, 0, 0);

describe('parsePeriod (rateio — competência)', () => {
  it('sem parâmetros usa o mês corrente inteiro', () => {
    const { from, to } = parsePeriod({}, NOW);

    expect(from.getTime()).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).getTime());
    // Último instante do dia 30: nada do último dia fica de fora.
    expect(to.getTime()).toBe(new Date(2026, 10, 30, 23, 59, 59, 999).getTime());
  });

  it('`to` com hora conta o dia inteiro', () => {
    const { to } = parsePeriod({ from: '2026-11-01', to: '2026-11-30T10:00:00Z' }, NOW);
    expect(to.getTime()).toBe(new Date(2026, 10, 30, 23, 59, 59, 999).getTime());
  });

  it('`from` começa na meia-noite do dia pedido', () => {
    const { from } = parsePeriod({ from: '2026-11-05', to: '2026-11-30' }, NOW);
    expect(from.getTime()).toBe(new Date(2026, 10, 5, 0, 0, 0, 0).getTime());
  });

  it('recusa data inválida com 400 em vez de estourar no banco', () => {
    expect(() => parsePeriod({ from: 'ontem' }, NOW)).toThrow(BadRequestException);
    expect(() => parsePeriod({ from: '2026-02-30' }, NOW)).toThrow(BadRequestException);
    // Campo vazio conta como ausente (usa o mês corrente), não como erro.
    expect(() => parsePeriod({ from: '', to: '' }, NOW)).not.toThrow();
    expect(() => parsePeriod({ to: '2026-13-01' }, NOW)).toThrow(BadRequestException);
  });

  it('recusa dia inexistente (31 de fevereiro não rola para março)', () => {
    expect(() => parsePeriod({ from: '2026-02-31' }, NOW)).toThrow(BadRequestException);
  });

  it('recusa período invertido', () => {
    expect(() => parsePeriod({ from: '2026-11-30', to: '2026-11-01' }, NOW)).toThrow(
      BadRequestException
    );
  });
});
