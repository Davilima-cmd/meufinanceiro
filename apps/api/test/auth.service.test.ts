import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  accountShare: {
    updateMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
} as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  accountShare: {
    updateMany: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

const jwtMock = {
  sign: vi.fn().mockReturnValue('fake-token'),
} as unknown as { sign: ReturnType<typeof vi.fn> };

function makeService() {
  return new AuthService(prismaMock as unknown as PrismaService, jwtMock as unknown as JwtService);
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(makeService()).toBeDefined();
  });

  it('should hash a password and verify it correctly', async () => {
    const hashed = await makeService().hashPassword('senha-secreta');
    expect(hashed).not.toBe('senha-secreta');
    expect(await makeService().comparePassword('senha-secreta', hashed)).toBe(true);
    expect(await makeService().comparePassword('senha-errada', hashed)).toBe(false);
  });

  it('should register a new user without returning the password', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'davi@example.com',
      name: 'Davi',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await makeService().register({
      email: 'davi@example.com',
      name: 'Davi',
      password: 'senha-secreta',
    });

    expect(result.id).toBe('user-1');
    expect(result.email).toBe('davi@example.com');
    expect((result as { password?: string }).password).toBeUndefined();
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: 'davi@example.com',
        name: 'Davi',
        password: expect.any(String),
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('should reject registration when email already exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'davi@example.com',
      name: 'Davi',
      password: 'x',
    });

    await expect(
      makeService().register({
        email: 'davi@example.com',
        name: 'Davi',
        password: 'senha-secreta',
      })
    ).rejects.toThrow('Email já cadastrado');
  });

  it('should validate user credentials for login', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'davi@example.com',
      name: 'Davi',
      password: await makeService().hashPassword('senha-secreta'),
    });

    const user = await makeService().validateUser('davi@example.com', 'senha-secreta');
    expect(user).toMatchObject({ id: 'user-1', email: 'davi@example.com' });

    const wrong = await makeService().validateUser('davi@example.com', 'senha-errada');
    expect(wrong).toBeNull();
  });

  describe('deleteAccount', () => {
    it('exclui o usuário, revoga compartilhamentos titularizados e grava auditoria', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'davi@example.com',
        name: 'Davi',
      });

      await makeService().deleteAccount('user-1');

      expect(prismaMock.accountShare.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'ACCOUNT_DELETED',
          target: 'user-1',
          metadata: { deletedAt: expect.any(String) },
        },
      });
      expect(prismaMock.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('lança NotFound quando o usuário não existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(makeService().deleteAccount('user-inexistente')).rejects.toThrow(
        'Usuário não encontrado'
      );
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });
  });
});
