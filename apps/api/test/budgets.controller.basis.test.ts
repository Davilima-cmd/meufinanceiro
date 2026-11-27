import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BudgetsController } from '../src/budgets/budgets.controller';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Gasto do orçamento na mesma base do painel e do rateio.
 *
 * Defeitos cobertos:
 *  1. o gasto usava `date` (caixa) em vez de `competenceDate` (competência):
 *     aluguel de dezembro pago em janeiro contava em janeiro;
 *  2. `pending` consumia o limite antes de sair do caixa;
 *  3. `PATCH /budgets/:id` devolvia só `amountCents`, sem `spentCents` /
 *     `remainingCents` — a tela atualizada mostrava "—" até recarregar.
 */
describe('orçamento: base de competência e contrato do PATCH', () => {
  const budgetRow = {
    id: 'bud-1',
    userId: 'u1',
    categoryId: 'cat-1',
    amountCents: '100000',
    periodStart: new Date('2026-12-01T00:00:00.000Z'),
    periodEnd: new Date('2026-12-31T23:59:59.000Z'),
    createdAt: new Date('2026-12-01T00:00:00.000Z'),
    updatedAt: new Date('2026-12-01T00:00:00.000Z'),
    category: { id: 'cat-1', name: 'Moradia', color: '#fff' },
  };

  let prisma: {
    budget: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    transaction: {
      findMany: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
    category: { findFirst: ReturnType<typeof vi.fn> };
  };
  let controller: BudgetsController;

  beforeEach(() => {
    prisma = {
      budget: {
        findMany: vi.fn(async () => [budgetRow]),
        findFirst: vi.fn(async () => ({
          periodStart: budgetRow.periodStart,
          periodEnd: budgetRow.periodEnd,
        })),
        findUnique: vi.fn(async () => budgetRow),
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => budgetRow),
      },
      transaction: {
        findMany: vi.fn(async () => []),
        aggregate: vi.fn(async () => ({ _sum: { amountCents: '-30000' } })),
      },
      category: { findFirst: vi.fn(async () => ({ id: 'cat-1' })) },
    };
    controller = new BudgetsController(prisma as unknown as PrismaService);
  });

  it('consulta despesas liquidadas pela competência dentro do período', async () => {
    await controller.list({ user: { userId: 'u1' } } as never);

    const where = prisma.transaction.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('paid');
    expect(where.deletedAt).toBeNull();
    expect(where.competenceDate).toEqual({
      gte: budgetRow.periodStart,
      lte: budgetRow.periodEnd,
    });
    // `date` não pode ser o critério de período.
    expect(where.date).toBeUndefined();
  });

  it('gasto usa a data de competência do lançamento, não a data de caixa', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      {
        categoryId: 'cat-1',
        amountCents: '-25000',
        // pago em janeiro, mas pertence a dezembro
        date: new Date('2027-01-05T00:00:00.000Z'),
        competenceDate: new Date('2026-12-15T00:00:00.000Z'),
        status: 'paid',
      },
    ]);

    const [budget] = await controller.list({ user: { userId: 'u1' } } as never);

    expect(budget.spentCents).toBe('25000');
    expect(budget.remainingCents).toBe('75000');
  });

  it('despesa fora da competência do período não consome o orçamento', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      {
        categoryId: 'cat-1',
        amountCents: '-25000',
        date: new Date('2026-12-20T00:00:00.000Z'),
        competenceDate: new Date('2027-01-02T00:00:00.000Z'),
        status: 'paid',
      },
    ]);

    const [budget] = await controller.list({ user: { userId: 'u1' } } as never);

    expect(budget.spentCents).toBe('0');
    expect(budget.remainingCents).toBe('100000');
  });

  it('PATCH devolve o mesmo contrato do GET (spentCents e remainingCents)', async () => {
    const updated = await controller.update({ user: { userId: 'u1' } } as never, 'bud-1', {
      amountCents: '100000',
    });

    expect(updated.amountCents).toBe('100000');
    expect(updated.spentCents).toBe('30000');
    expect(updated.remainingCents).toBe('70000');
  });

  it('recusa período invertido no PATCH usando o lado que já está gravado', async () => {
    await expect(
      controller.update({ user: { userId: 'u1' } } as never, 'bud-1', {
        periodEnd: '2026-11-01T00:00:00.000Z',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa período invertido na criação', async () => {
    await expect(
      controller.create({ user: { userId: 'u1' } } as never, {
        categoryId: 'cat-1',
        amountCents: '1000',
        periodStart: '2026-12-31T00:00:00.000Z',
        periodEnd: '2026-12-01T00:00:00.000Z',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
