import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TransactionsController } from '../src/transactions/transactions.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  transaction: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  financialAccount: {
    findFirst: vi.fn(),
  },
} as unknown as PrismaService;

function makeController() {
  return new TransactionsController(prismaMock);
}

const req = (userId = 'user-1') => ({ user: { userId } }) as any;

describe('TransactionsController', () => {
  it('impede criar transacao em conta de outro usuario', async () => {
    (prismaMock.financialAccount.findFirst as any).mockResolvedValue(null);

    await expect(
      makeController().create(req('user-1'), {
        accountId: 'conta-alheia',
        description: 'x',
        amountCents: '-1000',
        type: 'expense',
        date: '2026-01-01',
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });
});
