import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CategoriesController } from '../src/categories/categories.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  category: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
  },
} as unknown as {
  category: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

function makeController() {
  return new CategoriesController(prismaMock as unknown as PrismaService);
}

const req = (userId = 'user-1') => ({ user: { userId } }) as any;

describe('CategoriesController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista categorias próprias e do sistema', async () => {
    prismaMock.category.findMany.mockResolvedValue([]);
    await makeController().list(req());
    expect(prismaMock.category.findMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user-1' }, { userId: null }] },
      orderBy: [{ isSystem: 'asc' }, { name: 'asc' }],
    });
  });

  it('cria categoria do usuário', async () => {
    prismaMock.category.create.mockResolvedValue({ id: 'c-1', userId: 'user-1' });
    await makeController().create(req(), { name: 'Lazer', color: '#ff0000' });
    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: { name: 'Lazer', color: '#ff0000', userId: 'user-1', isSystem: false },
    });
  });

  it('atualiza apenas categoria própria e não do sistema', async () => {
    prismaMock.category.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.category.findUnique.mockResolvedValue({ id: 'c-1', name: 'Novo' });

    await makeController().update(req(), 'c-1', { name: 'Novo' });

    expect(prismaMock.category.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-1', userId: 'user-1', isSystem: false },
      data: { name: 'Novo' },
    });
  });

  it('responde 404 ao atualizar categoria de outro usuário', async () => {
    prismaMock.category.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      makeController().update(req(), 'c-alheia', { name: 'Novo' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove apenas categoria própria', async () => {
    prismaMock.category.deleteMany.mockResolvedValue({ count: 1 });

    await expect(makeController().remove(req(), 'c-1')).resolves.toEqual({ id: 'c-1' });
    expect(prismaMock.category.deleteMany).toHaveBeenCalledWith({
      where: { id: 'c-1', userId: 'user-1', isSystem: false },
    });
  });

  it('não permite excluir categoria do sistema', async () => {
    prismaMock.category.deleteMany.mockResolvedValue({ count: 0 });
    await expect(makeController().remove(req(), 'c-sistema')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
