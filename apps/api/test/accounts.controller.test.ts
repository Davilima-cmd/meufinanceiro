import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountsController } from '../src/accounts/accounts.controller';
import { PrismaService } from '../src/prisma/prisma.service';

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
  financialAccount: { create: vi.fn() },
  transaction: { create: vi.fn() },
};

const req = { user: { userId: 'user-1' } } as never;

function controller() {
  return new AccountsController(prismaMock);
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
    (prismaMock.financialAccount.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });
    await expect(controller().update(req, 'acc-x', { isActive: false })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('recusa excluir conta com lançamentos', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
    });
    (prismaMock.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    await expect(controller().remove(req, 'acc-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.financialAccount.delete).not.toHaveBeenCalled();
  });

  it('exclui conta sem histórico', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
    });
    (prismaMock.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prismaMock.financialAccount.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await expect(controller().remove(req, 'acc-1')).resolves.toEqual({ deleted: 1 });
  });

  it('não exclui conta inexistente ou de outro dono', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(controller().remove(req, 'acc-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
