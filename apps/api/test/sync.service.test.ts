import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncService } from '../src/sync/sync.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { BankProviderAdapter } from '../src/sync/provider.adapter';
import { HttpStatus } from '@nestjs/common';

const NOW = new Date('2026-11-11T12:00:00Z');

const prismaMock = {
  bankConnection: {
    findMany: vi.fn(),
  },
  syncJob: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    upsert: vi.fn(),
    aggregate: vi.fn(),
  },
  financialAccount: {
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
} as unknown as {
  bankConnection: { findMany: ReturnType<typeof vi.fn> };
  syncJob: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  transaction: {
    upsert: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  financialAccount: { update: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
};

const adapterMock = {
  fetchTransactions: vi.fn(),
} as unknown as { fetchTransactions: ReturnType<typeof vi.fn> };

function makeService() {
  return new SyncService(
    prismaMock as unknown as PrismaService,
    adapterMock as unknown as BankProviderAdapter
  );
}

const connection = {
  id: 'bc-1',
  userId: 'user-1',
  accountId: 'acct-1',
  provider: 'sandbox',
  providerAccountId: 'pa-1',
  status: 'active',
};

const providerTransactions = [
  {
    providerId: 'prov_pa-1_1001',
    description: 'Pagamento recebido (sandbox)',
    amountCents: 350000,
    type: 'income' as const,
    date: new Date('2026-11-09T10:00:00Z'),
  },
  {
    providerId: 'prov_pa-1_1002',
    description: 'Supermercado (sandbox)',
    amountCents: -18745,
    type: 'expense' as const,
    date: new Date('2026-11-10T10:00:00Z'),
  },
];

describe('SyncService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();

    prismaMock.bankConnection.findMany.mockResolvedValue([connection]);
    prismaMock.syncJob.create.mockResolvedValue({
      id: 'sj-1',
      status: 'pending',
    });
    prismaMock.syncJob.update.mockResolvedValue({ id: 'sj-1', status: 'completed' });
    adapterMock.fetchTransactions.mockResolvedValue(providerTransactions);
    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amountCents: '281255' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconcilia transações do provedor e marca o job como concluído', async () => {
    const result = await makeService().reconcileUser('user-1', {
      trigger: 'manual',
    });

    expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: 'pending' },
    });
    expect(prismaMock.transaction.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.transaction.upsert).toHaveBeenNthCalledWith(1, {
      where: { providerId: 'prov_pa-1_1001' },
      update: {
        description: 'Pagamento recebido (sandbox)',
        amountCents: '350000',
        type: 'income',
        date: providerTransactions[0].date,
      },
      create: {
        accountId: 'acct-1',
        userId: 'user-1',
        providerId: 'prov_pa-1_1001',
        description: 'Pagamento recebido (sandbox)',
        amountCents: '350000',
        type: 'income',
        origin: 'imported',
        date: providerTransactions[0].date,
      },
    });
    // Saldo da conta recomputado a partir dos lançamentos.
    expect(prismaMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acct-1' },
      data: { balanceCents: '281255' },
    });
    expect(result.status).toBe('completed');
    expect(prismaMock.syncJob.update).toHaveBeenCalledWith({
      where: { id: 'sj-1' },
      data: {
        status: 'completed',
        startedAt: expect.any(Date),
        finishedAt: expect.any(Date),
      },
    });
  });

  it('é idempotente: reexecutar usa upsert pelo providerId do provedor', async () => {
    await makeService().reconcileUser('user-1', { trigger: 'manual' });
    await makeService().reconcileUser('user-1', { trigger: 'manual' });

    expect(prismaMock.transaction.upsert).toHaveBeenCalledTimes(4);
    // Duas execuções, cada uma tenta criar/atualizar os mesmos IDs do provedor.
    expect(
      prismaMock.transaction.upsert.mock.calls.filter(
        (call) => call[0].where.providerId === 'prov_pa-1_1001'
      )
    ).toHaveLength(2);
  });

  it('marca o job como falho quando o provedor indisponível', async () => {
    adapterMock.fetchTransactions.mockRejectedValue(new Error('provedor fora do ar'));
    prismaMock.syncJob.update.mockResolvedValue({
      id: 'sj-1',
      status: 'failed',
      error: 'provedor fora do ar',
    });

    const result = await makeService().reconcileUser('user-1', {
      trigger: 'manual',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('provedor fora do ar');
    expect(prismaMock.syncJob.update).toHaveBeenCalledWith({
      where: { id: 'sj-1' },
      data: {
        status: 'failed',
        finishedAt: expect.any(Date),
        error: expect.stringContaining('provedor fora do ar'),
      },
    });
  });

  it('o botão respeita o limite de frequência (429)', async () => {
    const oneMinuteAgo = new Date(NOW.getTime() - 60 * 1000);
    prismaMock.syncJob.findFirst.mockResolvedValue({
      id: 'sj-old',
      status: 'completed',
      createdAt: oneMinuteAgo,
    });

    await expect(
      makeService().reconcileUser('user-1', { trigger: 'manual' })
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(prismaMock.syncJob.create).not.toHaveBeenCalled();
  });

  it('um job anterior com falha não bloqueia nova tentativa manual', async () => {
    const oneMinuteAgo = new Date(NOW.getTime() - 60 * 1000);
    prismaMock.syncJob.findFirst.mockResolvedValue({
      id: 'sj-old',
      status: 'failed',
      createdAt: oneMinuteAgo,
    });

    await makeService().reconcileUser('user-1', { trigger: 'manual' });
    expect(prismaMock.syncJob.create).toHaveBeenCalled();
  });

  it('a varredura diária ignora o limite de frequência do botão', async () => {
    const oneMinuteAgo = new Date(NOW.getTime() - 60 * 1000);
    prismaMock.syncJob.findFirst.mockResolvedValue({
      id: 'sj-old',
      status: 'completed',
      createdAt: oneMinuteAgo,
    });

    await makeService().reconcileUser('user-1', { trigger: 'daily' });
    expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: 'pending' },
    });
  });

  it('runDailyReconciliation executa para usuários devedores e pula os recentes', async () => {
    const oldFinished = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
    const recentFinished = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);

    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
    prismaMock.syncJob.findFirst
      .mockResolvedValueOnce({ finishedAt: oldFinished }) // user-1: devedor
      .mockResolvedValueOnce({ finishedAt: recentFinished }); // user-2: em dia

    await makeService().runDailyReconciliation();

    expect(prismaMock.syncJob.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: 'pending' },
    });
  });

  it('runDailyReconciliation executa quando nunca houve sincronização', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    prismaMock.syncJob.findFirst.mockResolvedValue(null);

    await makeService().runDailyReconciliation();

    expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: 'pending' },
    });
  });
});
