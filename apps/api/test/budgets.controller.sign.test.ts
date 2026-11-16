import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetsController } from '../src/budgets/budgets.controller';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * C3 - Sinal das despesas invertido no cálculo do gasto do orçamento.
 *
 * O schema grava despesas com `amountCents` NEGATIVO
 * (schema.prisma: "centavos, negativo para despesa"). O controller filtra
 * `type: 'expense'` e somava o valor sem inverter o sinal, então:
 *   spentCents    saia negativo
 *   remainingCents = limite - (negativo)  -> valor inflado
 */
describe('C3 - calculo do gasto do orcamento', () => {
  let prisma: {
    budget: { findMany: ReturnType<typeof vi.fn> };
    transaction: { findMany: ReturnType<typeof vi.fn> };
  };
  let controller: BudgetsController;

  beforeEach(() => {
    prisma = {
      budget: {
        findMany: vi.fn(async () => [
          {
            id: 'bud-1',
            categoryId: 'cat-1',
            amountCents: '30000',
            periodStart: new Date('2026-11-01'),
            periodEnd: new Date('2026-11-30'),
            createdAt: new Date('2026-11-01'),
            updatedAt: new Date('2026-11-01'),
            category: { id: 'cat-1', name: 'Mercado', color: '#fff' },
          },
        ]),
      },
      transaction: {
        // Despesas no banco têm amountCents NEGATIVO.
        findMany: vi.fn(async () => [
          { categoryId: 'cat-1', amountCents: '-18740', date: new Date('2026-11-10') },
        ]),
      },
    } as never;

    controller = new BudgetsController(prisma as unknown as PrismaService);
  });

  it('spentCents é POSITIVO (o valor absoluto do gasto)', async () => {
    const [budget] = await controller.list({ user: { userId: 'u1' } } as never);

    expect(budget.spentCents).toBe('18740');
  });

  it('remainingCents é o limite MENOS o gasto (não inflado)', async () => {
    const [budget] = await controller.list({ user: { userId: 'u1' } } as never);

    // 30000 - 18740 = 11260
    expect(budget.remainingCents).toBe('11260');
  });

  it('nao ha gasto quando o limite e menor que o gasto (restante negativo)', async () => {
    prisma.budget.findMany.mockResolvedValue([
      {
        id: 'bud-1',
        categoryId: 'cat-1',
        amountCents: '10000',
        periodStart: new Date('2026-11-01'),
        periodEnd: new Date('2026-11-30'),
        createdAt: new Date('2026-11-01'),
        updatedAt: new Date('2026-11-01'),
        category: { id: 'cat-1', name: 'Mercado', color: '#fff' },
      },
    ]);

    const [budget] = await controller.list({ user: { userId: 'u1' } } as never);

    expect(budget.spentCents).toBe('18740');
    expect(budget.remainingCents).toBe('-8740');
  });
});
