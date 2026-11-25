import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from '../src/auth/password-reset.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';

/**
 * Regras do item 26.2: nunca revelar se o e-mail existe, token de uso único com
 * prazo, e troca de senha que invalida as sessões abertas.
 */

const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  passwordReset: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  session: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
} as unknown as PrismaService;

const txMock = {
  user: { update: vi.fn() },
  passwordReset: { update: vi.fn() },
  session: { deleteMany: vi.fn() },
};

const authMock = {
  hashPassword: vi.fn(async () => 'novo-hash'),
} as unknown as AuthService;

function service() {
  return new PasswordResetService(prismaMock, authMock);
}

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof txMock) => unknown) => fn(txMock)
  );
  (txMock.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (txMock.passwordReset.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (txMock.session.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });
});

describe('PasswordResetService — pedido', () => {
  it('responde igual quando o e-mail não existe (não revela cadastro)', async () => {
    (prismaMock.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().request('ninguem@ex.com')).resolves.toEqual({ requested: true });
    expect(prismaMock.passwordReset.create).not.toHaveBeenCalled();
  });

  it('cria token com hash (nunca em texto puro) e prazo de 30 minutos', async () => {
    (prismaMock.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    (prismaMock.passwordReset.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const before = Date.now();
    await service().request('davi@ex.com');

    const arg = (prismaMock.passwordReset.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: { tokenHash: string; expiresAt: Date; userId: string };
    };
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const ttl = arg.data.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(31 * 60 * 1000);
  });
});

describe('PasswordResetService — redefinição', () => {
  const valid = {
    id: 'reset-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };

  it('grava a nova senha, marca o token como usado e encerra as sessões', async () => {
    (prismaMock.passwordReset.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(valid);

    await service().reset('a'.repeat(64), 'senha-nova-123');

    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { password: 'novo-hash' },
    });
    expect(txMock.passwordReset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'reset-1' } })
    );
    expect(txMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('recusa token expirado', async () => {
    (prismaMock.passwordReset.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...valid,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service().reset('b'.repeat(64), 'senha-nova-123')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  it('recusa reutilização de token já usado', async () => {
    (prismaMock.passwordReset.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...valid,
      usedAt: new Date(),
    });
    await expect(service().reset('c'.repeat(64), 'senha-nova-123')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('recusa token inexistente', async () => {
    (prismaMock.passwordReset.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service().reset('d'.repeat(64), 'senha-nova-123')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
