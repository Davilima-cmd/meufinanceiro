import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountsController } from '../src/accounts/accounts.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccountAccessService } from '../src/common/account-access.service';

/** Conta com histórico não pode ser apagada; o caminho correto é arquivar. */

const prismaMock = {
  financialAccount: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  transaction: { create: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
} as unknown as PrismaService;

const txMock = {
  financialAccount: { create: vi.fn(), update: vi.fn() },
  transaction: { create: vi.fn(), updateMany: vi.fn() },
  accountShare: { updateMany: vi.fn() },
};

const req = { user: { userId: 'user-1' } } as never;

function controller() {
  return new AccountsController(prismaMock, new AccountAccessService(prismaMock as never));
}

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof txMock) => unknown) => fn(txMock)
  );
  (txMock.financialAccount.create as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'acc-1',
      institution: null,
      currency: 'BRL',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    })
  );
});

describe('AccountsController — saldo inicial', () => {
  it('grava o saldo inicial como movimento, com o sinal correto', async () => {
    const account = await controller().create(req, { name: 'Carteira', balanceCents: '-25000' });

    expect(account.balanceCents).toBe('-25000');
    expect(txMock.financialAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balanceCents: '-25000', userId: 'user-1' }),
      })
    );
    expect(txMock.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1',
        amountCents: '-25000',
        type: 'expense',
        description: 'Saldo inicial',
        // Nasce liquidado: o saldo da conta é derivado do que já é caixa.
        status: 'paid',
      }),
    });
  });

  it('não cria movimento quando o saldo inicial é zero', async () => {
    await controller().create(req, { name: 'Carteira' });
    expect(txMock.transaction.create).not.toHaveBeenCalled();
  });
});

describe('AccountsController — arquivar e excluir', () => {
  it('arquiva via PATCH e devolve a conta atualizada', async () => {
    (prismaMock.financialAccount.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
      userId: 'user-1',
      name: 'Carteira',
      institution: null,
      type: 'manual',
      currency: 'BRL',
      balanceCents: 25000,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const account = await controller().update(req, 'acc-1', { isActive: false });

    expect(account.isActive).toBe(false);
    expect(prismaMock.financialAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 'acc-1', userId: 'user-1' },
      data: { isActive: false },
    });
  });

  it('recusa arquivar conta de outro usuário', async () => {
    // `assertWritable` consulta a conta antes: invisível/inábil → 403/404.
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user-2',
    });
    await expect(controller().update(req, 'acc-x', { isActive: false })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(prismaMock.financialAccount.updateMany).not.toHaveBeenCalled();
  });

  it('excluir conta é exclusão lógica: marca deletedAt e esconde o histórico', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
      userId: 'user-1',
    });

    await expect(controller().remove(req, 'acc-1')).resolves.toEqual({ deleted: 1 });

    // Nada é apagado do banco: conta, lançamentos e compartilhamentos ganham
    // marca de exclusão na mesma transação.
    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
    expect(txMock.transaction.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(txMock.accountShare.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prismaMock.financialAccount.delete).not.toHaveBeenCalled();
  });

  it('exclui conta mesmo com histórico (antes era recusado)', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
      userId: 'user-1',
    });

    await expect(controller().remove(req, 'acc-1')).resolves.toEqual({ deleted: 1 });
  });

  it('não exclui conta inexistente ou de outro dono', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(controller().remove(req, 'acc-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(txMock.financialAccount.update).not.toHaveBeenCalled();
  });
});

/**
 * Forma pública da conta.
 *
 * O `select` precisa de `userId` para decidir quem é o dono, mas o id interno do
 * usuário não é dado de resposta: o JSON devolvia `userId` em cada item (o
 * cliente usa `ownerId`, que é explícito).
 */
describe('AccountsController — não vaza userId na resposta', () => {
  const row = {
    id: 'acc-1',
    userId: 'user-1',
    name: 'Conta corrente',
    institution: 'Banco',
    type: 'checking',
    currency: 'BRL',
    balanceCents: 100000,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('lista contas próprias sem o campo userId', async () => {
    (prismaMock.financialAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);
    (
      prismaMock as unknown as { accountShare: { findMany: ReturnType<typeof vi.fn> } }
    ).accountShare = { findMany: vi.fn(async () => []) };

    const [account] = await controller().list(req);

    expect(account).not.toHaveProperty('userId');
    expect(account.ownerId).toBe('user-1');
    expect(account.balanceCents).toBe('100000');
  });

  it('list contas compartilhadas também sem userId e com o dono correto', async () => {
    (prismaMock.financialAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...row, id: 'acc-2', userId: 'user-2' },
    ]);
    (
      prismaMock as unknown as { accountShare: { findMany: ReturnType<typeof vi.fn> } }
    ).accountShare = {
      findMany: vi.fn(async () => [
        { accountId: 'acc-2', level: 'BALANCE_ONLY', owner: { id: 'user-2', name: 'Parceiro' } },
      ]),
    };

    const [account] = await controller().list(req);

    expect(account).not.toHaveProperty('userId');
    expect(account.ownerId).toBe('user-2');
    expect(account.ownerName).toBe('Parceiro');
    expect(account.access).toMatchObject({ readOnly: true, canSeeTransactions: false });
  });
});
