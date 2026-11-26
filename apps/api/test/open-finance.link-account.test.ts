import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OpenFinanceAccountsController } from '../src/open-finance/open-finance-accounts.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SyncService } from '../src/sync/sync.service';
import type { OpenFinanceProvider } from '../src/open-finance/open-finance.provider';

/**
 * Vínculo de conta via Open Finance.
 *
 * A conta bancária nasce do que a instituição informa — nunca é digitada no
 * app. O que estes testes protegem: o `providerAccountId` é conferido contra a
 * lista real do provedor (antes, `POST /open-finance/connections` aceitava
 * qualquer id inventado e vinculava uma conta manual qualquer).
 */

const ACCOUNTS = [
  {
    id: 'remote-1',
    name: 'Conta Corrente Nubank',
    institution: 'Nubank',
    type: 'checking',
    currency: 'BRL',
    balanceCents: '250000',
  },
];

const prismaMock = {
  bankConnection: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  consent: { create: vi.fn() },
  financialAccount: { create: vi.fn() },
  $transaction: vi.fn(),
} as unknown as {
  bankConnection: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  consent: { create: ReturnType<typeof vi.fn> };
  financialAccount: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const providerMock = {
  kind: 'live' as const,
  listAccounts: vi.fn(),
  listTransactions: vi.fn(),
  createConsent: vi.fn(),
} as unknown as OpenFinanceProvider;

const listAccountsMock = providerMock.listAccounts as unknown as ReturnType<typeof vi.fn>;
const createConsentMock = providerMock.createConsent as unknown as ReturnType<typeof vi.fn>;

const syncMock = { reconcileUser: vi.fn() } as unknown as SyncService & {
  reconcileUser: ReturnType<typeof vi.fn>;
};

const req = { user: { userId: 'user-1' } } as never;

function controller(provider: OpenFinanceProvider = providerMock) {
  return new OpenFinanceAccountsController(
    prismaMock as unknown as PrismaService,
    syncMock as unknown as SyncService,
    provider
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  process.env.NODE_ENV = 'test';
  listAccountsMock.mockResolvedValue(ACCOUNTS);
  createConsentMock.mockResolvedValue({
    externalId: 'consent-ext-1',
    status: 'active',
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  });
  prismaMock.bankConnection.findMany.mockResolvedValue([]);
  prismaMock.bankConnection.findFirst.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      financialAccount: {
        create: vi.fn(async () => ({ id: 'acc-new', name: ACCOUNTS[0].name })),
      },
      consent: { create: vi.fn(async () => ({ id: 'consent-1' })) },
      bankConnection: { create: vi.fn(async () => ({ id: 'conn-1' })) },
    })
  );
  syncMock.reconcileUser.mockResolvedValue({ status: 'completed' });
});

describe('GET /open-finance/available-accounts', () => {
  it('lista as contas do provedor e marca as já vinculadas', async () => {
    prismaMock.bankConnection.findMany.mockResolvedValue([{ providerAccountId: 'remote-1' }]);
    const result = await controller().availableAccounts();

    expect(result.available).toBe(true);
    expect(result.accounts[0]).toMatchObject({
      providerAccountId: 'remote-1',
      institution: 'Nubank',
      balanceCents: '250000',
      alreadyLinked: true,
    });
  });

  it('sem provedor real, em produção responde indisponível em vez de oferecer sandbox', async () => {
    process.env.NODE_ENV = 'production';
    const sandbox = { ...providerMock, kind: 'sandbox' } as unknown as OpenFinanceProvider;

    const result = await controller(sandbox).availableAccounts();

    expect(result.available).toBe(false);
    expect(result.accounts).toEqual([]);
    expect(result.reason).toContain('ainda não está liberada');
  });
});

describe('POST /open-finance/link-account', () => {
  it('cria a conta com os dados do banco e a deixa vinculada', async () => {
    const result = await controller().linkAccount(req, {
      provider: 'pluggy',
      providerAccountId: 'remote-1',
    });

    expect(result).toMatchObject({ connectionId: 'conn-1', synced: true });
    // O saldo vem do provedor, não de um campo digitado.
    expect(listAccountsMock).toHaveBeenCalled();
    expect(syncMock.reconcileUser).toHaveBeenCalledWith('user-1', { trigger: 'daily' });
  });

  it('recusa conta que o provedor não conhece (id inventado pelo cliente)', async () => {
    await expect(
      controller().linkAccount(req, { provider: 'pluggy', providerAccountId: 'inventado' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('não vincula a mesma conta bancária duas vezes', async () => {
    prismaMock.bankConnection.findFirst.mockResolvedValue({ id: 'c1', userId: 'user-1' });
    await expect(
      controller().linkAccount(req, { provider: 'pluggy', providerAccountId: 'remote-1' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recusa vínculo pelo sandbox em produção (saldo fictício não vira conta real)', async () => {
    process.env.NODE_ENV = 'production';
    const sandbox = { ...providerMock, kind: 'sandbox' } as unknown as OpenFinanceProvider;

    await expect(
      controller(sandbox).linkAccount(req, { provider: 'sandbox', providerAccountId: 'remote-1' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falha na sincronização não desfaz o vínculo', async () => {
    syncMock.reconcileUser.mockRejectedValue(new Error('provedor fora do ar'));

    const result = await controller().linkAccount(req, {
      provider: 'pluggy',
      providerAccountId: 'remote-1',
    });

    expect(result.connectionId).toBe('conn-1');
    expect(result.synced).toBe(false);
  });
});
