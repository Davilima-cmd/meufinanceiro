import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CronController, CronSecretGuard } from '../src/cron/cron.controller';
import type { RecurrencesService } from '../src/recurrences/recurrences.service';
import type { SyncService } from '../src/sync/sync.service';

/**
 * Rotas de cron.
 *
 * O agendamento em processo não sobrevive na Vercel (a invocação morre e o
 * `setInterval` junto), então recorrências e reconciliação diária precisam de
 * uma rota que um cron externo chame. O que estes testes protegem: a rota não
 * pode ficar aberta — sem segredo configurado ela nem existe, e com segredo
 * só aceita quem o apresenta.
 */

const recurrencesMock = { run: vi.fn() };
const syncMock = { runDailyReconciliation: vi.fn() };

function controller() {
  return new CronController(
    recurrencesMock as unknown as RecurrencesService,
    syncMock as unknown as SyncService
  );
}

function contextWith(headers: Record<string, string | string[] | undefined>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as never;
}

describe('CronSecretGuard', () => {
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('responde 404 quando o segredo não está configurado (rota inexistente)', () => {
    delete process.env.CRON_SECRET;
    expect(() => new CronSecretGuard().canActivate(contextWith({}))).toThrow(NotFoundException);
  });

  it('recusa sem credencial', () => {
    process.env.CRON_SECRET = 'segredo-de-cron';
    expect(() => new CronSecretGuard().canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });

  it('recusa credencial errada', () => {
    process.env.CRON_SECRET = 'segredo-de-cron';
    expect(() =>
      new CronSecretGuard().canActivate(contextWith({ 'x-cron-secret': 'outro' }))
    ).toThrow(UnauthorizedException);
  });

  it('aceita o header x-cron-secret', () => {
    process.env.CRON_SECRET = 'segredo-de-cron';
    expect(
      new CronSecretGuard().canActivate(contextWith({ 'x-cron-secret': 'segredo-de-cron' }))
    ).toBe(true);
  });

  it('aceita Authorization: Bearer (formato que a Vercel Cron envia)', () => {
    process.env.CRON_SECRET = 'segredo-de-cron';
    expect(
      new CronSecretGuard().canActivate(contextWith({ authorization: 'Bearer segredo-de-cron' }))
    ).toBe(true);
  });
});

describe('CronController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recurrencesMock.run.mockResolvedValue({ created: 3 });
    syncMock.runDailyReconciliation.mockResolvedValue(undefined);
  });

  it('roda recorrências de todos os usuários e a reconciliação diária', async () => {
    const result = await controller().daily();

    expect(result).toEqual({ ok: true, recurrencesCreated: 3 });
    // Sem `userId`: cron não é de um usuário só.
    expect(recurrencesMock.run).toHaveBeenCalledWith();
    expect(syncMock.runDailyReconciliation).toHaveBeenCalledTimes(1);
  });

  it('propaga falha em vez de devolver ok falso', async () => {
    recurrencesMock.run.mockRejectedValue(new Error('banco fora do ar'));

    await expect(controller().daily()).rejects.toThrow('banco fora do ar');
    expect(syncMock.runDailyReconciliation).not.toHaveBeenCalled();
  });
});
