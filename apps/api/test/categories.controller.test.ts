import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoriesController } from '../src/categories/categories.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  category: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
} as unknown as {
  category: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function makeController() {
  return new CategoriesController(prismaMock as unknown as PrismaService);
}

const req = (userId = 'user-1') => ({ user: { userId } } as any);

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

  it('atualiza apenas categoria própria', async () => {
    prismaMock.category.update.mockResolvedValue({ id: 'c-1' });
    await makeController().update(req(), 'c-1', { name: 'Novo' });
    expect(prismaMock.category.update).toHaveBeenCalledWith({
      where: { id: 'c-1', userId: 'user-1' },
      data: { name: 'Novo' },
    });
  });

  it('remove apenas categoria própria', async () => {
    prismaMock.category.delete.mockResolvedValue({ id: 'c-1' });
    await makeController().remove(req(), 'c-1');
    expect(prismaMock.category.delete).toHaveBeenCalledWith({
      where: { id: 'c-1', userId: 'user-1' },
    });
  });
});
