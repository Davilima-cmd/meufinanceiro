import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpenFinanceAccountsController } from '../src/open-finance/open-finance-accounts.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SyncService } from '../src/sync/sync.service';
import type { OpenFinanceProvider } from '../src/open-finance/open-finance.provider';

/**
 * Conexão de banco pelo widget de consentimento (Pluggy / Open Finance).
 *
 * O widget é a única porta para um item real: o usuário autoriza no app do
 * banco e o provedor devolve o `itemId`. O que estes testes protegem:
 *
 * - o corpo da requisição só carrega o `itemId` — conta, saldo e tipo vêm do
 *   provedor, nunca do navegador;
 * - item com erro de login não vira vínculo "meio conectado";
 * - conta já vinculada não é duplicada;
 * - o histórico é importado no ato, senão a conta parece vazia.
 */

const ACCOUNTS = [
  {
    id: 'remote-1',
    itemId: 'item-1',
    name: 'Conta Corrente',
    institution: 'Nubank',
    type: 'checking',
    currency: 'BRL',
    balanceCents: '250000',
  },
  {
    id: 'remote-2',
    itemId: 'item-1',
    name: 'Cartão',
    institution: 'Nubank',
    type: 'credit',
    currency: 'BRL',
    balanceCents: '-150000',
  },
  {
    id: 'remote-outro-item',
    itemId: 'item-2',
    name: 'Conta de outro item',
    institution: 'Itaú',
    type: 'checking',
    currency: 'BRL',
    balanceCents: '1000',
  },
];

const prismaMock = {
  bankConnection: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  consent: { create: vi.fn() },
  financialAccount: { create: vi.fn() },
  $transaction: vi.fn(),
};

const providerMock = {
  kind: 'live' as const,
  listAccounts: vi.fn(),
  listTransactions: vi.fn(),
  createConsent: vi.fn(),
  itemStatus: vi.fn(),
  connectToken: vi.fn(),
};

const syncMock = { reconcileUser: vi.fn() };

const req = { user: { userId: 'user-1' } } as never;

function controller(provider: unknown = providerMock) {
  return new OpenFinanceAccountsController(
    prismaMock as unknown as PrismaService,
    syncMock as unknown as SyncService,
    provider as OpenFinanceProvider
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  providerMock.listAccounts.mockResolvedValue(ACCOUNTS);
  providerMock.itemStatus.mockResolvedValue({ status: 'UPDATED', executionStatus: 'SUCCESS' });
  providerMock.createConsent.mockResolvedValue({
    externalId: 'item-1',
    status: 'active',
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  });
  prismaMock.consent.create.mockResolvedValue({ id: 'consent-1' });
  prismaMock.bankConnection.findFirst.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      financialAccount: { create: vi.fn(async () => ({ id: 'acc-new' })) },
      bankConnection: { create: vi.fn(async () => ({ id: 'conn-new' })) },
    };
    const result = await fn(tx);
    return result ?? { account: { id: 'acc-new' }, connection: { id: 'conn-new' } };
  });
  syncMock.reconcileUser.mockResolvedValue({ status: 'completed' });
});

describe('POST /open-finance/connect-token', () => {
  it('devolve o token do widget sem expor o segredo do provedor', async () => {
    providerMock.connectToken.mockResolvedValue({ accessToken: 'token-abc' });

    const result = await controller().connectToken(req);

    expect(result.accessToken).toBe('token-abc');
    expect(JSON.stringify(result)).not.toContain('clientSecret');
    expect(providerMock.connectToken).toHaveBeenCalledWith('user-1', undefined);
  });

  it('com provider sandbox (sem credenciais) responde erro claro em vez de token falso', async () => {
    const sandbox = { ...providerMock, kind: 'sandbox' } as unknown as OpenFinanceProvider;
    const sandboxController = controller(sandbox);
    // O sandbox não implementa connectToken.
    delete (sandbox as unknown as { connectToken?: unknown }).connectToken;

    await expect(sandboxController.connectToken(req)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('POST /open-finance/connect-item', () => {
  it('importa apenas as contas do item conectado', async () => {
    providerMock.listAccounts.mockResolvedValue(ACCOUNTS);

    const result = await controller().connectItem(req, { itemId: 'item-1' });

    // ACCOUNTS tem 3 contas, mas só 2 pertencem ao item-1.
    expect(result).toMatchObject({ accounts: 2, created: 2, synced: true });
    expect(syncMock.reconcileUser).toHaveBeenCalledWith('user-1', { trigger: 'daily' });
  });

  it('guarda o providerItemId para que a sincronização futura ache o item', async () => {
    const created: unknown[] = [];
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        financialAccount: { create: vi.fn(async () => ({ id: 'acc-new' })) },
        bankConnection: {
          create: vi.fn(async (args: { data: unknown }) => {
            created.push(args.data);
            return { id: 'conn-new' };
          }),
        },
      })
    );

    await controller().connectItem(req, { itemId: 'item-1' });

    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ provider: 'pluggy', providerItemId: 'item-1' });
  });

  it('não duplica conta já vinculada', async () => {
    prismaMock.bankConnection.findFirst.mockResolvedValue({ id: 'conn-x', userId: 'user-1' });

    const result = await controller().connectItem(req, { itemId: 'item-1' });

    expect(result).toMatchObject({ created: 0, skipped: 2, synced: false });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('recusa item em erro de login em vez de criar vínculo quebrado', async () => {
    providerMock.itemStatus.mockResolvedValue({ status: 'LOGIN_ERROR', executionStatus: 'ERROR' });

    await expect(controller().connectItem(req, { itemId: 'item-1' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('responde 404 quando o item não existe no provedor', async () => {
    providerMock.itemStatus.mockRejectedValue(new Error('404'));

    await expect(controller().connectItem(req, { itemId: 'sumiu' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('explica que o banco ainda está processando quando não há conta pronta', async () => {
    providerMock.listAccounts.mockResolvedValue([]);

    await expect(controller().connectItem(req, { itemId: 'item-1' })).rejects.toThrow(
      /processando/i
    );
  });
});
