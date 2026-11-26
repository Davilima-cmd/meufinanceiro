import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { nextOccurrence, RecurrencesService } from '../src/recurrences/recurrences.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Lançamentos recorrentes.
 *
 * O que importa aqui: a geração nunca duplica (o cursor `nextRunAt` avança na
 * mesma transação) e o lançamento nasce `pending` — recorrente é conta a
 * pagar/receber, não dinheiro que saiu do caixa.
 */
const prismaMock = {
  recurrence: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  transaction: { create: vi.fn() },
  financialAccount: { findFirst: vi.fn() },
  $transaction: vi.fn(),
};

const txMock = {
  transaction: { create: vi.fn() },
  recurrence: { update: vi.fn() },
};

function service() {
  return new RecurrencesService(prismaMock as unknown as PrismaService);
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) =>
    fn(txMock)
  );
  prismaMock.financialAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
});

describe('RecurrencesService', () => {
  it('cria o modelo com o próximo vencimento no dia escolhido', async () => {
    prismaMock.recurrence.create.mockResolvedValue({ id: 'rec-1' });

    await service().create('user-1', {
      accountId: 'acc-1',
      description: 'Aluguel',
      amountCents: '-150000',
      type: 'expense',
      dayOfMonth: 5,
      startAt: '2026-11-01',
    });

    const args = (prismaMock.recurrence.create.mock.calls[0] as unknown[])[0] as {
      data: { dayOfMonth: number; nextRunAt: Date; amountCents: string };
    };
    expect(args.data.dayOfMonth).toBe(5);
    expect(args.data.nextRunAt.getDate()).toBe(5);
    expect(args.data.nextRunAt.getMonth()).toBe(11); // dezembro
    expect(args.data.amountCents).toBe('-150000');
  });

  it('dia 31 vira 28 (meses curtos não têm dia 31)', async () => {
    prismaMock.recurrence.create.mockResolvedValue({ id: 'rec-1' });

    await service().create('user-1', {
      accountId: 'acc-1',
      description: 'Assinatura',
      amountCents: '-1990',
      type: 'expense',
      dayOfMonth: 31,
    });

    const args = (prismaMock.recurrence.create.mock.calls[0] as unknown[])[0] as {
      data: { dayOfMonth: number };
    };
    expect(args.data.dayOfMonth).toBe(28);
  });

  it('recusa conta de outra pessoa', async () => {
    prismaMock.financialAccount.findFirst.mockResolvedValue(null);

    await expect(
      service().create('user-1', {
        accountId: 'acc-x',
        description: 'Aluguel',
        amountCents: '-100',
        type: 'expense',
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa valor zero e sinal incoerente com o tipo', async () => {
    await expect(
      service().create('user-1', {
        accountId: 'acc-1',
        description: 'Aluguel',
        amountCents: '0',
        type: 'expense',
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service().create('user-1', {
        accountId: 'acc-1',
        description: 'Salário',
        amountCents: '-100',
        type: 'income',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gera lançamento pendente e avança o cursor na mesma transação', async () => {
    prismaMock.recurrence.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        userId: 'user-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        description: 'Aluguel',
        amountCents: { toString: () => '-150000' },
        type: 'expense',
        dayOfMonth: 5,
        nextRunAt: new Date('2026-11-05T12:00:00Z'),
      },
    ]);

    const result = await service().run('user-1');

    expect(result).toEqual({ created: 1 });
    const created = (txMock.transaction.create.mock.calls[0] as unknown[])[0] as {
      data: { status: string; origin: string; amountCents: string; dueDate: Date };
    };
    expect(created.data.status).toBe('pending');
    expect(created.data.origin).toBe('recurring');
    expect(created.data.amountCents).toBe('-150000');
    expect(txMock.recurrence.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: { nextRunAt: expect.any(Date) },
    });
  });

  it('nada a gerar não cria lançamento', async () => {
    prismaMock.recurrence.findMany.mockResolvedValue([]);

    await expect(service().run()).resolves.toEqual({ created: 0 });
    expect(txMock.transaction.create).not.toHaveBeenCalled();
  });

  it('pausar recorrência de outro usuário responde 404', async () => {
    prismaMock.recurrence.updateMany.mockResolvedValue({ count: 0 });

    await expect(service().setActive('user-1', 'rec-x', false)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

describe('nextOccurrence', () => {
  it('avança um mês mantendo o dia', () => {
    const next = nextOccurrence(new Date('2026-11-05T12:00:00Z'), 5);

    expect(next.getMonth()).toBe(11);
    expect(next.getDate()).toBe(5);
  });

  it('vira o ano corretamente', () => {
    const next = nextOccurrence(new Date('2026-12-10T12:00:00Z'), 10);

    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
  });

  it('dia 30 em fevereiro cai no último dia do mês', () => {
    const next = nextOccurrence(new Date('2027-01-30T12:00:00Z'), 30);

    expect(next.getMonth()).toBe(1); // fevereiro
    expect(next.getDate()).toBe(28);
  });
});
