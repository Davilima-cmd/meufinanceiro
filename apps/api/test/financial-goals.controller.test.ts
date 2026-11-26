import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinancialGoalsController } from '../src/financial-goals/financial-goals.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  financialGoal: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  goalContribution: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
} as unknown as {
  financialGoal: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  goalContribution: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

function makeController() {
  return new FinancialGoalsController(prismaMock as unknown as PrismaService);
}

const req = (userId = 'user-1') => ({ user: { userId } }) as any;

describe('FinancialGoalsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock)
    );
    prismaMock.financialGoal.findFirst.mockResolvedValue({ id: 'g-1' });
  });

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
    prismaMock.financialGoal.findFirst.mockResolvedValue({
      id: 'g-1',
      currentCents: { toString: () => '5000' },
    });
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
    prismaMock.financialGoal.findFirst.mockResolvedValue(null);
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

  it('registra aporte e incrementa o saldo da meta na mesma transação', async () => {
    prismaMock.financialGoal.update.mockResolvedValue({
      id: 'g-1',
      targetCents: { toString: () => '100000' },
      currentCents: { toString: () => '25000' },
    });

    const result = await makeController().addContribution(req(), 'g-1', {
      amountCents: '25000',
      note: 'Salário de novembro',
    });

    expect(prismaMock.goalContribution.create).toHaveBeenCalledWith({
      data: {
        goalId: 'g-1',
        amountCents: '25000',
        note: 'Salário de novembro',
        occurredAt: expect.any(Date),
      },
    });
    expect(prismaMock.financialGoal.update).toHaveBeenCalledWith({
      where: { id: 'g-1' },
      data: { currentCents: { increment: 25000n } },
    });
    expect(result.currentCents).toBe('25000');
  });

  it('recusa aporte de valor zero', async () => {
    await expect(
      makeController().addContribution(req(), 'g-1', { amountCents: '0' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aporte em meta de outra pessoa responde 404', async () => {
    prismaMock.financialGoal.findFirst.mockResolvedValue(null);

    await expect(
      makeController().addContribution(req(), 'g-alheia', { amountCents: '100' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista o histórico do mais recente para o mais antigo', async () => {
    prismaMock.goalContribution.findMany.mockResolvedValue([
      {
        id: 'c-2',
        amountCents: { toString: () => '1000' },
        note: null,
        occurredAt: new Date('2026-11-20'),
      },
      {
        id: 'c-1',
        amountCents: { toString: () => '500' },
        note: 'inicial',
        occurredAt: new Date('2026-11-01'),
      },
    ]);

    const rows = await makeController().contributions(req(), 'g-1');

    expect(rows.map((row) => row.id)).toEqual(['c-2', 'c-1']);
    expect(rows[0].amountCents).toBe('1000');
  });

  it('remover aporte devolve o valor ao saldo da meta', async () => {
    prismaMock.goalContribution.findFirst.mockResolvedValue({
      amountCents: { toString: () => '25000' },
    });
    prismaMock.financialGoal.update.mockResolvedValue({
      id: 'g-1',
      targetCents: { toString: () => '100000' },
      currentCents: { toString: () => '0' },
    });

    await makeController().removeContribution(req(), 'g-1', 'c-1');

    expect(prismaMock.goalContribution.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(prismaMock.financialGoal.update).toHaveBeenCalledWith({
      where: { id: 'g-1' },
      data: { currentCents: { decrement: 25000n } },
    });
  });

  it('ajuste manual do saldo entra como aporte no histórico', async () => {
    prismaMock.financialGoal.findFirst.mockResolvedValue({
      id: 'g-1',
      currentCents: { toString: () => '1000' },
    });
    prismaMock.financialGoal.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.financialGoal.findUnique.mockResolvedValue({
      id: 'g-1',
      targetCents: { toString: () => '100000' },
      currentCents: { toString: () => '5000' },
    });

    await makeController().update(req(), 'g-1', { currentCents: '5000' });

    expect(prismaMock.goalContribution.create).toHaveBeenCalledWith({
      data: {
        goalId: 'g-1',
        amountCents: '4000',
        note: 'Ajuste manual do saldo',
      },
    });
  });
});
