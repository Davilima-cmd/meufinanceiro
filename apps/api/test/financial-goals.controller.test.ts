import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { FinancialGoalsController } from '../src/financial-goals/financial-goals.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  financialGoal: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
  },
} as unknown as {
  financialGoal: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
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
    prismaMock.financialGoal.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.financialGoal.findUnique.mockResolvedValue({
      id: 'g-1',
      targetCents: { toString: () => '10000' },
      currentCents: { toString: () => '5000' },
    });
    prismaMock.financialGoal.deleteMany.mockResolvedValue({ count: 1 });

    await makeController().update(req(), 'g-1', { currentCents: '5000' });
    expect(prismaMock.financialGoal.updateMany).toHaveBeenCalledWith({
      where: { id: 'g-1', userId: 'user-1' },
      data: { currentCents: '5000' },
    });

    await makeController().remove(req(), 'g-1');
    expect(prismaMock.financialGoal.deleteMany).toHaveBeenCalledWith({
      where: { id: 'g-1', userId: 'user-1' },
    });
  });

  it('responde 404 ao tentar alterar meta de outro usuário', async () => {
    prismaMock.financialGoal.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      makeController().update(req(), 'g-alheia', { currentCents: '5000' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 404 ao tentar remover meta de outro usuário', async () => {
    prismaMock.financialGoal.deleteMany.mockResolvedValue({ count: 0 });
    await expect(makeController().remove(req(), 'g-alheia')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
