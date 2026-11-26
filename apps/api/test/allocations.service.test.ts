import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AllocationsService } from '../src/allocations/allocations.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Rateio no serviço: quem pode participar, quem pode alterar e o que a tela
 * recebe.
 */
const prismaMock = {
  transaction: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  partnership: { findFirst: vi.fn() },
  allocation: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

function service() {
  return new AllocationsService(prismaMock as unknown as PrismaService);
}

const transaction = {
  id: 'tx-1',
  userId: 'user-1',
  amountCents: { toString: () => '-10000' },
  account: { shares: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)
  );
  prismaMock.transaction.findFirst.mockResolvedValue(transaction);
  prismaMock.partnership.findFirst.mockResolvedValue({ partnerId: 'user-2' });
  prismaMock.allocation.findMany.mockResolvedValue([]);
});

describe('AllocationsService', () => {
  it('divide a despesa entre o dono e o parceiro, fechando o valor', async () => {
    await service().upsert('user-1', 'tx-1', { participants: ['user-1', 'user-2'] });

    const created = (prismaMock.allocation.createMany.mock.calls[0] as unknown[])[0] as {
      data: Array<{ userId: string; shareCents: string }>;
    };
    expect(created.data.map((row) => row.shareCents)).toEqual(['5000', '5000']);
    expect(created.data.map((row) => row.userId)).toEqual(['user-1', 'user-2']);
  });

  it('refazer o rateio substitui as partes anteriores', async () => {
    await service().upsert('user-1', 'tx-1', { participants: ['user-1'] });

    expect(prismaMock.allocation.deleteMany).toHaveBeenCalledWith({
      where: { transactionId: 'tx-1' },
    });
  });

  it('recusa participante fora da parceria', async () => {
    await expect(
      service().upsert('user-1', 'tx-1', { participants: ['user-1', 'estranho'] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sem parceria aceita, só o próprio dono pode participar', async () => {
    prismaMock.partnership.findFirst.mockResolvedValue(null);

    await expect(
      service().upsert('user-1', 'tx-1', { participants: ['user-1', 'user-2'] })
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service().upsert('user-1', 'tx-1', { participants: ['user-1'] })
    ).resolves.toBeDefined();
  });

  it('recusa rateio de lançamento de outra pessoa', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service().upsert('user-1', 'tx-x', { participants: ['user-1'] })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('aceita rateio proporcional com pesos', async () => {
    await service().upsert('user-1', 'tx-1', {
      participants: ['user-1', 'user-2'],
      mode: 'proportional',
      weights: { 'user-1': 70, 'user-2': 30 },
    });

    const created = (prismaMock.allocation.createMany.mock.calls[0] as unknown[])[0] as {
      data: Array<{ shareCents: string; percentBasis: number | null; mode: string }>;
    };
    expect(created.data.map((row) => row.shareCents)).toEqual(['7000', '3000']);
    expect(created.data[0].percentBasis).toBe(70);
    expect(created.data[0].mode).toBe('proportional');
  });

  it('lista as partes com o nome de cada participante', async () => {
    prismaMock.allocation.findMany.mockResolvedValue([
      {
        id: 'al-1',
        userId: 'user-1',
        shareCents: { toString: () => '5000' },
        mode: 'equal',
        percentBasis: null,
        settledAt: null,
        user: { name: 'Davi' },
      },
    ]);

    const parts = await service().list('user-1', 'tx-1');

    expect(parts).toEqual([
      {
        id: 'al-1',
        userId: 'user-1',
        name: 'Davi',
        shareCents: '5000',
        mode: 'equal',
        percentBasis: null,
        settledAt: null,
      },
    ]);
  });

  it('resume quanto cada pessoa deve no período', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([{ id: 'tx-1' }, { id: 'tx-2' }]);
    prismaMock.allocation.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        shareCents: { toString: () => '3000' },
        settledAt: new Date(),
        user: { name: 'Davi' },
      },
      {
        userId: 'user-1',
        shareCents: { toString: () => '2000' },
        settledAt: null,
        user: { name: 'Davi' },
      },
      {
        userId: 'user-2',
        shareCents: { toString: () => '5000' },
        settledAt: null,
        user: { name: 'Ana' },
      },
    ]);

    const summary = await service().summary(
      'user-1',
      new Date('2026-11-01'),
      new Date('2026-11-30')
    );

    expect(summary.parts).toEqual([
      {
        userId: 'user-1',
        name: 'Davi',
        totalCents: '5000',
        settledCents: '3000',
        openCents: '2000',
      },
      { userId: 'user-2', name: 'Ana', totalCents: '5000', settledCents: '0', openCents: '5000' },
    ]);
  });

  it('período sem rateio devolve lista vazia', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);

    const summary = await service().summary('user-1', new Date(), new Date());
    expect(summary.parts).toEqual([]);
  });

  it('acertar uma parte já acertada responde 404', async () => {
    prismaMock.allocation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service().settle('user-1', 'tx-1', 'user-2')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
