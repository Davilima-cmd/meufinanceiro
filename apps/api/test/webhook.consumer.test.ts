import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookConsumerService } from '../src/open-finance/webhook-consumer.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SyncService } from '../src/sync/sync.service';

/**
 * Consumidor de `webhook_events`.
 *
 * O endpoint de webhook gravava o evento com `processed: false` e respondia
 * `{ received: true }` — e ninguém jamais lia a tabela. O provedor avisava que
 * o item sincronizou ou foi revogado, e o app só descobria na conciliação
 * diária, acumulando linhas para sempre. Estes testes cobrem o que o consumidor
 * faz com os eventos e o que ele se recusa a fazer.
 */

const events: Array<{ id: string; provider: string; payload: unknown }> = [];
const connections: Array<{ id: string; userId: string; status: string }> = [];

const prismaMock = {
  webhookEvent: {
    findMany: vi.fn(async () => events),
    update: vi.fn(async () => ({})),
  },
  bankConnection: {
    findMany: vi.fn(async () => connections),
    updateMany: vi.fn(async () => ({ count: connections.length })),
  },
} as unknown as PrismaService;

const syncMock = { reconcileUser: vi.fn(async () => ({ id: 'job' })) } as unknown as SyncService;

function service() {
  return new WebhookConsumerService(prismaMock, syncMock);
}

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  connections.length = 0;
});

describe('WebhookConsumerService', () => {
  it('sincroniza os donos das conexões ativas citadas nos eventos', async () => {
    events.push({
      id: 'ev-1',
      provider: 'pluggy',
      payload: { event: 'item/updated', itemId: 'item-1' },
    });
    events.push({
      id: 'ev-2',
      provider: 'pluggy',
      payload: { event: 'transactions/created', itemId: 'item-1' },
    });
    connections.push({ id: 'conn-1', userId: 'user-1', status: 'active' });

    const result = await service().processPending();

    expect(result).toMatchObject({ inspected: 2, processed: 2, usersSynced: 1 });
    // Dois eventos do mesmo item = uma sincronização só.
    expect(syncMock.reconcileUser).toHaveBeenCalledTimes(1);
    expect(syncMock.reconcileUser).toHaveBeenCalledWith('user-1', { trigger: 'daily' });
  });

  it('marca conexão revogada como expirada e não insiste na sincronização', async () => {
    events.push({
      id: 'ev-3',
      provider: 'pluggy',
      payload: { event: 'item/deleted', itemId: 'item-9' },
    });
    connections.push({ id: 'conn-9', userId: 'user-9', status: 'active' });

    await service().processPending();

    expect(prismaMock.bankConnection.updateMany).toHaveBeenCalledWith({
      where: { providerItemId: 'item-9' },
      data: { status: 'expired' },
    });
  });

  it('marca o evento como processado mesmo quando não há o que fazer', async () => {
    events.push({ id: 'ev-4', provider: 'pluggy', payload: { event: 'item/updated' } });
    events.push({
      id: 'ev-5',
      provider: 'pluggy',
      payload: { event: 'item/updated', itemId: 'item-desconhecido' },
    });

    const result = await service().processPending();

    expect(result).toMatchObject({ inspected: 2, processed: 0, ignored: 2 });
    // Sem isso, as mesmas linhas voltariam em toda execução, para sempre.
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'ev-4' },
      data: { processed: true },
    });
  });

  it('um evento que quebra não impede o processamento dos outros', async () => {
    events.push({ id: 'ev-6', provider: 'x', payload: null });
    events.push({
      id: 'ev-7',
      provider: 'pluggy',
      payload: { event: 'item/updated', item: { id: 'item-7' } },
    });
    connections.push({ id: 'conn-7', userId: 'user-7', status: 'active' });

    const result = await service().processPending();

    expect(result.inspected).toBe(2);
    expect(syncMock.reconcileUser).toHaveBeenCalledWith('user-7', { trigger: 'daily' });
  });

  it('lê o itemId aninhado (formato do provedor)', async () => {
    events.push({
      id: 'ev-8',
      provider: 'pluggy',
      payload: { event: 'item/updated', item: { id: 'item-nested' } },
    });
    connections.push({ id: 'conn-8', userId: 'user-8', status: 'active' });

    await service().processPending();

    expect(prismaMock.bankConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerItemId: 'item-nested' } })
    );
  });
});
