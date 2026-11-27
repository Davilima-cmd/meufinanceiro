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
    findMany: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
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
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  transaction: {
    findMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
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
    // Por padrão, nenhum lançamento existe ainda (primeira sincronização).
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.transaction.createMany.mockResolvedValue({ count: 0 });
    prismaMock.transaction.update.mockResolvedValue({});
    prismaMock.transaction.updateMany.mockResolvedValue({ count: 1 });
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
    // Busca existentes em uma única consulta + criação em lote (sem N+1 de upsert).
    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.transaction.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.transaction.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          providerId: 'prov_pa-1_1001',
          userId: 'user-1',
          accountId: 'acct-1',
          origin: 'imported',
        }),
        expect.objectContaining({
          providerId: 'prov_pa-1_1002',
          userId: 'user-1',
          accountId: 'acct-1',
          origin: 'imported',
        }),
      ]),
      skipDuplicates: true,
    });
    expect(prismaMock.transaction.update).not.toHaveBeenCalled();
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

  it('é idempotente: reexecutar cria apenas na primeira vez e atualiza na segunda', async () => {
    // Primeira execução: nada existente.
    prismaMock.transaction.findMany.mockResolvedValueOnce([]);
    // Segunda execução: os dois lançamentos já existem.
    prismaMock.transaction.findMany.mockResolvedValueOnce([
      { providerId: 'prov_pa-1_1001', id: 'tx-1001' },
      { providerId: 'prov_pa-1_1002', id: 'tx-1002' },
    ]);

    await makeService().reconcileUser('user-1', { trigger: 'manual' });
    await makeService().reconcileUser('user-1', { trigger: 'manual' });

    expect(prismaMock.transaction.createMany).toHaveBeenCalledTimes(1);
    // Atualização por `id` + `userId`: `providerId` é único global no banco (e
    // dois usuários do mesmo banco têm os mesmos ids do provedor), então um
    // `update({ where: { providerId } })` podia escrever na linha de outro.
    expect(prismaMock.transaction.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.transaction.update).not.toHaveBeenCalled();
    expect(
      prismaMock.transaction.updateMany.mock.calls.filter(
        (call) => call[0].where.id === 'tx-1001' && call[0].where.userId === 'user-1'
      )
    ).toHaveLength(1);
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
    // Último job de cada usuário em uma única consulta (sem N+1 de findFirst).
    prismaMock.syncJob.findMany.mockResolvedValue([
      { userId: 'user-1', finishedAt: oldFinished }, // user-1: devedor
      { userId: 'user-2', finishedAt: recentFinished }, // user-2: em dia
    ]);

    await makeService().runDailyReconciliation();

    expect(prismaMock.syncJob.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: 'pending' },
    });
    expect(prismaMock.syncJob.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.syncJob.findFirst).not.toHaveBeenCalled();
  });

  it('runDailyReconciliation executa quando nunca houve sincronização', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    prismaMock.syncJob.findMany.mockResolvedValue([]);

    await makeService().runDailyReconciliation();

    expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: 'pending' },
    });
  });
});
