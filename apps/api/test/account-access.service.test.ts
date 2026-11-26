import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountAccessService } from '../src/common/account-access.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Autorização centralizada.
 *
 * A mesma regra vale para todos os controllers, então ela precisa de testes
 * próprios: conta compartilhada é visível mas nunca escrevível, e conta de
 * terceiro responde `404` (não `403`, que confirmaria a existência).
 */
function service(account: { userId: string } | null) {
  const prisma = {
    financialAccount: { findFirst: vi.fn().mockResolvedValue(account) },
  } as unknown as PrismaService;
  return { access: new AccountAccessService(prisma), prisma };
}

describe('AccountAccessService', () => {
  it('conta própria é visível e escrevível', async () => {
    const { access } = service({ userId: 'user-1' });

    await expect(access.assertVisible('user-1', 'acc-1')).resolves.toEqual({ ownerId: 'user-1' });
    await expect(access.assertWritable('user-1', 'acc-1')).resolves.toEqual({ ownerId: 'user-1' });
  });

  it('conta compartilhada é visível mas não escrevível', async () => {
    const { access } = service({ userId: 'user-2' });

    await expect(access.assertVisible('user-1', 'acc-1')).resolves.toEqual({ ownerId: 'user-2' });
    await expect(access.assertWritable('user-1', 'acc-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('a recusa de escrita explica a regra em português', async () => {
    const { access } = service({ userId: 'user-2' });

    await expect(access.assertWritable('user-1', 'acc-1')).rejects.toThrow(/somente leitura/i);
  });

  it('conta inexistente ou invisível responde 404 nos dois casos', async () => {
    const { access } = service(null);

    await expect(access.assertVisible('user-1', 'acc-x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(access.assertWritable('user-1', 'acc-x')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('a lista de contas inclui as próprias e as compartilhadas', () => {
    const { access } = service(null);
    const where = access.listAccountsWhere('user-1') as {
      OR: Array<Record<string, unknown>>;
    };

    expect(where.OR[0]).toEqual({ userId: 'user-1' });
    expect(where.OR[1]).toMatchObject({
      shares: { some: { sharedWithId: 'user-1', revokedAt: null } },
    });
  });

  it('o histórico só inclui contas compartilhadas em FULL', () => {
    const { access } = service(null);
    const where = access.listTransactionsWhere('user-1') as {
      OR: Array<Record<string, unknown>>;
    };

    expect(where.OR[1]).toMatchObject({
      account: { shares: { some: { sharedWithId: 'user-1', level: 'FULL' } } },
    });
  });
});
