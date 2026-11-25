import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { BudgetsController } from '../src/budgets/budgets.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  budget: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  category: {
    findFirst: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
} as unknown as {
  budget: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  category: { findFirst: ReturnType<typeof vi.fn> };
  transaction: { findMany: ReturnType<typeof vi.fn> };
};

function makeController() {
  return new BudgetsController(prismaMock as unknown as PrismaService);
}

const req = (userId = 'user-1') => ({ user: { userId } }) as any;

const budgetRow = {
  id: 'b-1',
  userId: 'user-1',
  categoryId: 'cat-1',
  amountCents: { toString: () => '10000' },
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-01-31'),
  createdAt: new Date(),
  updatedAt: new Date(),
  category: { id: 'cat-1', name: 'Lazer', color: '#246b61' },
};

describe('BudgetsController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista orçamentos com gasto realizado e restante', async () => {
    prismaMock.budget.findMany.mockResolvedValue([budgetRow]);
    prismaMock.transaction.findMany.mockResolvedValue([
      {
        categoryId: 'cat-1',
        amountCents: { toString: () => '-3000' },
        date: new Date('2026-01-15'),
      },
      // fora do período: não deve contar
      {
        categoryId: 'cat-1',
        amountCents: { toString: () => '-9000' },
        date: new Date('2026-02-02'),
      },
    ]);

    const result = await makeController().list(req());

    expect(prismaMock.budget.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: { periodStart: 'desc' },
    });
    expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
      select: { categoryId: true, amountCents: true, date: true },
      where: {
        userId: 'user-1',
        type: 'expense',
        date: { gte: budgetRow.periodStart, lte: budgetRow.periodEnd },
      },
    });
    // Despesas são negativas no banco: o gasto usa o módulo.
    expect(result[0].spentCents).toBe('3000');
    expect(result[0].remainingCents).toBe('7000');
    expect(result[0].amountCents).toBe('10000');
  });

  it('cria orçamento vinculado ao usuário após validar a categoria', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' });
    prismaMock.budget.create.mockResolvedValue({
      ...budgetRow,
      amountCents: { toString: () => '10000' },
    });

    await makeController().create(req(), {
      categoryId: 'cat-1',
      amountCents: '10000',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });

    expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-1', OR: [{ userId: 'user-1' }, { userId: null }] },
      select: { id: true },
    });
    expect(prismaMock.budget.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        categoryId: 'cat-1',
        amountCents: '10000',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
      },
      include: { category: { select: { id: true, name: true, color: true } } },
    });
  });

  it('recusa criar orçamento para categoria de outro usuário', async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(
      makeController().create(req(), {
        categoryId: 'cat-alheia',
        amountCents: '10000',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.budget.create).not.toHaveBeenCalled();
  });

  it('atualiza apenas orçamento próprio', async () => {
    prismaMock.budget.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.budget.findUnique.mockResolvedValue({
      ...budgetRow,
      amountCents: { toString: () => '20000' },
    });

    const result = await makeController().update(req(), 'b-1', { amountCents: '20000' });

    expect(prismaMock.budget.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-1', userId: 'user-1' },
      data: { amountCents: '20000' },
    });
    expect(result.amountCents).toBe('20000');
  });

  it('responde 404 ao atualizar orçamento de outro usuário', async () => {
    prismaMock.budget.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      makeController().update(req(), 'b-1', { amountCents: '20000' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.budget.findUnique).not.toHaveBeenCalled();
  });

  it('remove apenas orçamento próprio', async () => {
    prismaMock.budget.deleteMany.mockResolvedValue({ count: 1 });

    await expect(makeController().remove(req(), 'b-1')).resolves.toEqual({ id: 'b-1' });
    expect(prismaMock.budget.deleteMany).toHaveBeenCalledWith({
      where: { id: 'b-1', userId: 'user-1' },
    });
  });

  it('responde 404 ao remover orçamento inexistente', async () => {
    prismaMock.budget.deleteMany.mockResolvedValue({ count: 0 });

    await expect(makeController().remove(req(), 'b-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
