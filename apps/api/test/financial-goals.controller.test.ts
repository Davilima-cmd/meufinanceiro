import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinancialGoalsController } from '../src/financial-goals/financial-goals.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  financialGoal: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
} as unknown as {
  financialGoal: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function makeController() {
  return new FinancialGoalsController(prismaMock as unknown as PrismaService);
}

const req = (userId = 'user-1') => ({ user: { userId } }) as any;

describe('FinancialGoalsController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista metas com progresso', async () => {
    prismaMock.financialGoal.findMany.mockResolvedValue([
      {
        id: 'g-1',
        userId: 'user-1',
        name: 'Viagem',
        targetCents: { toString: () => '10000' } as any,
        currentCents: { toString: () => '2500' } as any,
        dueDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await makeController().list(req());

    expect(prismaMock.financialGoal.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result[0].targetCents).toBe('10000');
    expect(result[0].currentCents).toBe('2500');
    expect(result[0].progress).toBe(0.25);
  });

  it('cria meta vinculada ao usuário', async () => {
    prismaMock.financialGoal.create.mockResolvedValue({
      id: 'g-1',
      targetCents: { toString: () => '10000' } as any,
      currentCents: { toString: () => '2500' } as any,
    });
    await makeController().create(req(), {
      name: 'Viagem',
      targetCents: '10000',
      currentCents: '2500',
      dueDate: '2026-12-31',
    });
    expect(prismaMock.financialGoal.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Viagem',
        targetCents: '10000',
        currentCents: '2500',
        dueDate: new Date('2026-12-31'),
      },
    });
  });

  it('atualiza e remove apenas meta própria', async () => {
    prismaMock.financialGoal.update.mockResolvedValue({
      id: 'g-1',
      targetCents: { toString: () => '10000' } as any,
      currentCents: { toString: () => '5000' } as any,
    });
    prismaMock.financialGoal.delete.mockResolvedValue({ id: 'g-1' });
    await makeController().update(req(), 'g-1', { currentCents: '5000' });
    expect(prismaMock.financialGoal.update).toHaveBeenCalledWith({
      where: { id: 'g-1', userId: 'user-1' },
      data: { currentCents: '5000' },
    });
    await makeController().remove(req(), 'g-1');
    expect(prismaMock.financialGoal.delete).toHaveBeenCalledWith({
      where: { id: 'g-1', userId: 'user-1' },
    });
  });
});
