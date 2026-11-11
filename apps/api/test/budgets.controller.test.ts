import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BudgetsController } from '../src/budgets/budgets.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  budget: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  transaction: {
    aggregate: vi.fn(),
  },
} as unknown as {
  budget: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  transaction: {
    aggregate: ReturnType<typeof vi.fn>;
  };
};

function makeController() {
  return new BudgetsController(prismaMock as unknown as PrismaService);
}

const req = (userId = 'user-1') => ({ user: { userId } } as any);

describe('BudgetsController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista orçamentos com gasto realizado e restante', async () => {
    const budget = {
      id: 'b-1',
      userId: 'user-1',
      categoryId: 'cat-1',
      amountCents: { toString: () => '10000' } as any,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      createdAt: new Date(),
      updatedAt: new Date(),
      category: { id: 'cat-1', name: 'Lazer', color: '#246b61' },
    };
    prismaMock.budget.findMany.mockResolvedValue([budget]);
    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amountCents: { toString: () => '3000' } as any },
    });

    const result = await makeController().list(req());

    expect(prismaMock.budget.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(prismaMock.transaction.aggregate).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        categoryId: 'cat-1',
        type: 'expense',
        date: { gte: budget.periodStart, lte: budget.periodEnd },
      },
      _sum: { amountCents: true },
    });
    expect(result[0].spentCents).toBe('3000');
    expect(result[0].remainingCents).toBe('7000');
    expect(result[0].amountCents).toBe('10000');
  });

  it('cria orçamento vinculado ao usuário', async () => {
    prismaMock.budget.create.mockResolvedValue({
      id: 'b-1',
      amountCents: { toString: () => '10000' } as any,
    });
    await makeController().create(req(), {
      categoryId: 'cat-1',
      amountCents: '10000',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
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

  it('atualiza e remove apenas orçamento próprio', async () => {
    prismaMock.budget.update.mockResolvedValue({
      id: 'b-1',
      amountCents: { toString: () => '20000' } as any,
    });
    prismaMock.budget.delete.mockResolvedValue({ id: 'b-1' });
    await makeController().update(req(), 'b-1', { amountCents: '20000' });
    expect(prismaMock.budget.update).toHaveBeenCalledWith({
      where: { id: 'b-1', userId: 'user-1' },
      data: { amountCents: '20000' },
      include: { category: { select: { id: true, name: true, color: true } } },
    });
    await makeController().remove(req(), 'b-1');
    expect(prismaMock.budget.delete).toHaveBeenCalledWith({
      where: { id: 'b-1', userId: 'user-1' },
    });
  });
});
