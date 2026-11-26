import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SharingService } from '../src/sharing/sharing.service';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  partnership: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  accountShare: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  financialAccount: { findFirst: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
} as unknown as PrismaService;

const txMock = {
  partnership: { update: vi.fn() },
  accountShare: { updateMany: vi.fn() },
};

function service() {
  return new SharingService(prismaMock);
}

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof txMock) => unknown) => fn(txMock)
  );
  (txMock.partnership.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (txMock.accountShare.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
});

describe('SharingService — convite', () => {
  it('convida quem já tem conta, criando parceria pendente', async () => {
    (prismaMock.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u2',
      name: 'Parceira',
      email: 'parceira@exemplo.test',
    });
    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prismaMock.partnership.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      status: 'pending',
    });

    const result = await service().invite('u1', 'Parceira@Exemplo.test ');
    expect(result).toMatchObject({ id: 'p1', status: 'pending' });
    const data = (prismaMock.partnership.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data).toEqual({ userId: 'u1', partnerId: 'u2', status: 'pending' });
  });

  it('recusa convite para e-mail sem conta ou para si mesmo', async () => {
    (prismaMock.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().invite('u1', 'ninguem@exemplo.test')).rejects.toBeInstanceOf(
      NotFoundException
    );

    (prismaMock.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      name: 'Eu',
      email: 'eu@exemplo.test',
    });
    await expect(service().invite('u1', 'eu@exemplo.test')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('recusa convite quando já são parceiros', async () => {
    (prismaMock.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u2',
      name: 'Parceira',
      email: 'p@exemplo.test',
    });
    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      status: 'accepted',
    });
    await expect(service().invite('u1', 'p@exemplo.test')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('só o convidado aceita, e precisa haver convite pendente', async () => {
    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().accept('u2')).rejects.toBeInstanceOf(NotFoundException);

    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
    });
    (prismaMock.partnership.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      status: 'accepted',
    });
    await expect(service().accept('u2')).resolves.toMatchObject({ status: 'accepted' });
    const args = (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mock.calls.at(
      -1
    )![0];
    expect(args.where).toEqual({ partnerId: 'u2', status: 'pending' });
  });
});

describe('SharingService — nível por conta', () => {
  it('só o dono muda o nível: conta de outro usuário não é encontrada', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().setLevel('u1', 'acc-do-parceiro', 'FULL')).rejects.toBeInstanceOf(
      NotFoundException
    );
    const where = (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mock
      .calls[0][0].where;
    expect(where).toEqual({ id: 'acc-do-parceiro', userId: 'u1' });
  });

  it('exige parceria aceita antes de compartilhar', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
    });
    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().setLevel('u1', 'acc-1', 'FULL')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('grava o nível para o parceiro aceito', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
    });
    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      partnerId: 'u2',
    });
    (prismaMock.accountShare.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      accountId: 'acc-1',
      level: 'FULL',
    });

    await service().setLevel('u1', 'acc-1', 'FULL');

    const args = (prismaMock.accountShare.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.create).toEqual({
      accountId: 'acc-1',
      userId: 'u1',
      sharedWithId: 'u2',
      level: 'FULL',
      revokedAt: null,
    });
    // Reativar um compartilhamento revogado é limpar `revokedAt`.
    expect(args.update).toEqual({ level: 'FULL', revokedAt: null });
  });

  it('nível `private` revoga o compartilhamento', async () => {
    (prismaMock.financialAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'acc-1',
    });

    const result = await service().setLevel('u1', 'acc-1', 'private');

    expect(result).toMatchObject({ level: 'private', revoked: true });
    expect(prismaMock.accountShare.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('recusa nível inventado', async () => {
    await expect(service().setLevel('u1', 'acc-1', 'tudo')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prismaMock.accountShare.upsert).not.toHaveBeenCalled();
  });
});

describe('SharingService — revogação da parceria', () => {
  it('derruba a parceria e revoga os compartilhamentos dos dois lados', async () => {
    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      partnerId: 'u2',
    });

    await service().revoke('u1');

    expect(txMock.partnership.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'revoked' },
    });
    const shareArgs = (txMock.accountShare.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(shareArgs.where.OR).toEqual([{ userId: 'u1' }, { userId: 'u2' }]);
    expect(shareArgs.data.revokedAt).toBeInstanceOf(Date);
  });

  it('sem parceria não há o que revogar', async () => {
    (prismaMock.partnership.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().revoke('u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
