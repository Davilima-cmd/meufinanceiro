import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from '../src/transactions/transactions.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  financialAccount: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  category: { findFirst: vi.fn() },
  $transaction: vi.fn(),
} as unknown as PrismaService;

const txMock = {
  transaction: {
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  financialAccount: {
    update: vi.fn(),
  },
};

function service() {
  return new TransactionsService(prismaMock);
}

const baseDto = {
  accountId: 'acc-1',
  description: 'Mercado',
  amountCents: '-15000',
  type: 'expense',
  date: '2026-11-10',
};

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof txMock) => unknown) => fn(txMock)
  );
  (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'acc-1',
  });
  (txMock.transaction.create as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'tx-1',
      ...data,
      account: { id: data.accountId, name: 'Conta' },
    })
  );
  (txMock.financialAccount.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe('TransactionsService — saldo derivado', () => {
  it('aplica o delta no saldo quando o lançamento já nasce liquidado', async () => {
    await service().create('user-1', { ...baseDto, status: 'paid' });

    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balanceCents: { increment: -15000n } },
    });
  });

  it('não mexe no saldo quando o lançamento é a pagar/receber', async () => {
    await service().create('user-1', { ...baseDto });

    expect(txMock.financialAccount.update).not.toHaveBeenCalled();

    const data = (txMock.transaction.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(data.paidAt).toBeNull();
  });

  it('separa competência, caixa e vencimento', async () => {
    await service().create('user-1', {
      ...baseDto,
      date: '2026-12-05',
      competenceDate: '2026-11-30',
      dueDate: '2026-12-10',
    });

    const data = (txMock.transaction.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.date).toEqual(new Date('2026-12-05'));
    expect(data.competenceDate).toEqual(new Date('2026-11-30'));
    expect(data.dueDate).toEqual(new Date('2026-12-10'));
  });

  it('sem competência informada, usa a data de caixa', async () => {
    await service().create('user-1', { ...baseDto, date: '2026-11-10' });

    const data = (txMock.transaction.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.competenceDate).toEqual(new Date('2026-11-10'));
  });

  it('recusa lançamento de valor zero', async () => {
    await expect(
      service().create('user-1', { ...baseDto, amountCents: '0' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa despesa com valor positivo e receita com valor negativo', async () => {
    await expect(
      service().create('user-1', { ...baseDto, amountCents: '15000', type: 'expense' })
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service().create('user-1', { ...baseDto, amountCents: '-15000', type: 'income' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não aceita conta de outro usuário', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().create('user-1', { ...baseDto })).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(txMock.transaction.create).not.toHaveBeenCalled();
  });

  it('não aceita categoria privada de outro usuário', async () => {
    (prismaMock.category.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      service().create('user-1', { ...baseDto, categoryId: 'cat-alheia' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(txMock.transaction.create).not.toHaveBeenCalled();
  });
});

describe('TransactionsService — transferência', () => {
  const transferDto = {
    accountId: 'acc-1',
    description: 'Para a reserva',
    amountCents: '50000',
    type: 'transfer',
    date: '2026-11-10',
    transferAccountId: 'acc-2',
  };

  it('cria as duas pontas com o mesmo transferId e move o saldo', async () => {
    (prismaMock.financialAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ]);

    const result = (await service().create('user-1', transferDto)) as {
      transferId: string;
      transactions: Array<{ amountCents: string; type: string }>;
    };

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.map((tx) => tx.amountCents).sort()).toEqual(['-50000', '50000']);
    expect(result.transactions.every((tx) => tx.type === 'transfer')).toBe(true);

    const created = (txMock.transaction.create as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as { data: { transferId: string } }).data.transferId
    );
    expect(new Set(created).size).toBe(1);
    expect(created[0]).toBe(result.transferId);

    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balanceCents: { decrement: 50000n } },
    });
    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-2' },
      data: { balanceCents: { increment: 50000n } },
    });
  });

  it('exige conta de destino diferente da origem', async () => {
    await expect(
      service().create('user-1', { ...transferDto, transferAccountId: 'acc-1' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige que as duas contas sejam do usuário', async () => {
    (prismaMock.financialAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'acc-1' },
    ]);
    await expect(service().create('user-1', transferDto)).rejects.toBeInstanceOf(NotFoundException);
    expect(txMock.transaction.create).not.toHaveBeenCalled();
  });
});

describe('TransactionsService — remoção e estorno', () => {
  it('remove a transferência inteira devolvendo o saldo das duas contas', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tx-1',
      accountId: 'acc-1',
      amountCents: { toString: () => '-50000' },
      transferId: 'tr-1',
      status: 'paid',
    });
    (prismaMock.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'tx-1', accountId: 'acc-1', amountCents: { toString: () => '-50000' }, status: 'paid' },
      { id: 'tx-2', accountId: 'acc-2', amountCents: { toString: () => '50000' }, status: 'paid' },
    ]);
    (txMock.transaction.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

    const result = await service().remove('user-1', 'tx-1');

    expect(result).toEqual({ deleted: 2 });
    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balanceCents: { decrement: -50000n } },
    });
    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-2' },
      data: { balanceCents: { decrement: 50000n } },
    });
    expect(txMock.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['tx-1', 'tx-2'] }, userId: 'user-1' },
    });
  });

  it('estorna criando o lançamento inverso em vez de apagar o original', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tx-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      description: 'Mercado',
      amountCents: { toString: () => '-15000' },
      type: 'expense',
      date: new Date('2026-11-10'),
      transferId: null,
      status: 'paid',
      competenceDate: new Date('2026-11-01'),
    });

    await service().reverse('user-1', 'tx-1');

    expect(txMock.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountCents: '15000',
          type: 'income',
          description: 'Estorno de Mercado',
        }),
      })
    );
    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balanceCents: { increment: 15000n } },
    });
    expect(txMock.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('recusa estornar transferência (o par é removido junto)', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tx-1',
      transferId: 'tr-1',
      amountCents: { toString: () => '50000' },
    });
    await expect(service().reverse('user-1', 'tx-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não remove lançamento de outro usuário', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().remove('user-1', 'tx-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TransactionsService — liquidação', () => {
  const pending = {
    id: 'tx-1',
    accountId: 'acc-1',
    amountCents: { toString: () => '-15000' },
    status: 'pending',
    transferId: null,
  };

  it('liquida um pendente aplicando o valor no saldo', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pending);
    (txMock.transaction.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tx-1', ...data })
    );

    const result = (await service().settle('user-1', 'tx-1', '2026-11-20')) as {
      status: string;
      paidAt: Date;
    };

    expect(result.status).toBe('paid');
    expect(result.paidAt).toEqual(new Date('2026-11-20'));
    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balanceCents: { increment: -15000n } },
    });
  });

  it('a data de caixa acompanha a liquidação', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pending);
    (txMock.transaction.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tx-1', ...data })
    );

    await service().settle('user-1', 'tx-1', '2026-11-20');

    const data = (txMock.transaction.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.date).toEqual(new Date('2026-11-20'));
    expect(data.status).toBe('paid');
  });

  it('é idempotente por status: não liquida duas vezes', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pending,
      status: 'paid',
    });

    await expect(service().settle('user-1', 'tx-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(txMock.financialAccount.update).not.toHaveBeenCalled();
  });

  it('recusa liquidar cancelado e transferência', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pending,
      status: 'canceled',
    });
    await expect(service().settle('user-1', 'tx-1')).rejects.toBeInstanceOf(BadRequestException);

    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pending,
      transferId: 'tr-1',
    });
    await expect(service().settle('user-1', 'tx-2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa liquidar lançamento de outro usuário', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().settle('user-1', 'tx-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancela pendente sem mexer no saldo', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pending);
    (prismaMock.transaction as unknown as { update: ReturnType<typeof vi.fn> }).update = vi
      .fn()
      .mockResolvedValue({ id: 'tx-1', status: 'canceled' });

    await service().cancel('user-1', 'tx-1');

    expect(txMock.financialAccount.update).not.toHaveBeenCalled();
  });

  it('recusa cancelar lançamento já liquidado (caminho é o estorno)', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pending,
      status: 'paid',
    });

    await expect(service().cancel('user-1', 'tx-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remover um pendente não devolve valor ao saldo', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pending);
    (txMock.transaction.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await service().remove('user-1', 'tx-1');

    expect(txMock.financialAccount.update).not.toHaveBeenCalled();
    expect(txMock.transaction.deleteMany).toHaveBeenCalled();
  });

  it('editar um liquidado reaplica só a diferença no saldo', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tx-1',
      accountId: 'acc-1',
      amountCents: { toString: () => '-15000' },
      status: 'paid',
      type: 'expense',
    });
    (txMock.transaction.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tx-1', ...data })
    );

    await service().update('user-1', 'tx-1', { amountCents: '-20000' });

    expect(txMock.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balanceCents: { increment: -5000n } },
    });
  });

  it('editar um pendente não mexe no saldo', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tx-1',
      accountId: 'acc-1',
      amountCents: { toString: () => '-15000' },
      status: 'pending',
      type: 'expense',
    });
    (txMock.transaction.update as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tx-1', ...data })
    );

    await service().update('user-1', 'tx-1', { amountCents: '-20000' });

    expect(txMock.financialAccount.update).not.toHaveBeenCalled();
  });

  it('recusa editar cancelado e valor que inverta o sinal do tipo', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tx-1',
      accountId: 'acc-1',
      amountCents: { toString: () => '-15000' },
      status: 'canceled',
      type: 'expense',
    });
    await expect(service().update('user-1', 'tx-1', {})).rejects.toBeInstanceOf(
      BadRequestException
    );

    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tx-1',
      accountId: 'acc-1',
      amountCents: { toString: () => '-15000' },
      status: 'paid',
      type: 'expense',
    });
    await expect(
      service().update('user-1', 'tx-1', { amountCents: '15000' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa estornar lançamento não liquidado', async () => {
    (prismaMock.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pending);
    await expect(service().reverse('user-1', 'tx-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
