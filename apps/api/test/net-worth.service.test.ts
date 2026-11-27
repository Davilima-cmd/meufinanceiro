import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NetWorthService } from '../src/net-worth/net-worth.service';
import { UpdateNetWorthItemDto } from '../src/net-worth/dto/net-worth.dto';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Patrimônio: conta + bem − dívida. Se a dívida não entra, o número mente.
 */
const prismaMock = {
  netWorthItem: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  financialAccount: { findMany: vi.fn() },
};

const service = () => new NetWorthService(prismaMock as unknown as PrismaService);
const decimal = (value: string) => ({ toString: () => value });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.netWorthItem.findMany.mockResolvedValue([]);
  prismaMock.financialAccount.findMany.mockResolvedValue([]);
});

describe('NetWorthService.summary', () => {
  it('subtrai dívidas do patrimônio', async () => {
    prismaMock.financialAccount.findMany.mockResolvedValue([
      { id: 'acc-1', name: 'Corrente', balanceCents: decimal('1000000'), type: 'checking' },
    ]);
    prismaMock.netWorthItem.findMany.mockResolvedValue([
      { id: 'i-1', name: 'Carro', kind: 'asset', valueCents: decimal('5000000'), note: null },
      {
        id: 'i-2',
        name: 'Financiamento',
        kind: 'liability',
        valueCents: decimal('4500000'),
        note: null,
      },
    ]);

    const summary = await service().summary('user-1');

    expect(summary.accountsTotalCents).toBe('1000000');
    expect(summary.assetsCents).toBe('5000000');
    expect(summary.liabilitiesCents).toBe('4500000');
    expect(summary.netCents).toBe('1500000');
  });

  it('ignora conta excluída e inativa', async () => {
    await service().summary('user-1');

    expect(prismaMock.financialAccount.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null, isActive: true },
      select: { id: true, name: true, balanceCents: true, type: true },
    });
  });

  it('sem nada cadastrado, patrimônio é zero', async () => {
    const summary = await service().summary('user-1');

    expect(summary.netCents).toBe('0');
    expect(summary.items).toEqual([]);
  });
});

describe('NetWorthService.create', () => {
  it('recusa valor zero ou negativo', async () => {
    await expect(
      service().create('user-1', { name: 'Dívida', kind: 'liability', valueCents: '0' })
    ).rejects.toBeInstanceOf(BadRequestException);

    // Negativo inverteria o sinal do tipo e esconderia a dívida.
    await expect(
      service().create('user-1', { name: 'Dívida', kind: 'liability', valueCents: '-100' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria item vinculado ao usuário', async () => {
    prismaMock.netWorthItem.create.mockResolvedValue({ id: 'i-1' });

    await service().create('user-1', {
      name: '  Apartamento ',
      kind: 'asset',
      valueCents: '30000000',
    });

    expect(prismaMock.netWorthItem.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Apartamento',
        kind: 'asset',
        valueCents: '30000000',
        note: null,
      },
    });
  });
});

describe('NetWorthService.update/remove', () => {
  it('404 quando o item é de outra pessoa', async () => {
    prismaMock.netWorthItem.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.netWorthItem.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service().update('user-1', 'i-x', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(service().remove('user-1', 'i-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

/**
 * Observação do item de patrimônio.
 *
 * Antes, `note` num DTO de update era `@IsOptional() @IsString() @Length(1,255)`:
 * `null` e `''` davam 422 e o serviço só gravava quando a chave vinha definida.
 * Uma observação escrita por engano não tinha como ser removida — só excluindo
 * o item e cadastrando de novo.
 */
describe('NetWorthService — observação (note)', () => {
  it('`null` apaga a observação; `undefined` não mexe nela', async () => {
    prismaMock.netWorthItem.updateMany.mockResolvedValue({ count: 1 });

    await service().update('u-1', 'item-1', { note: null });
    expect(prismaMock.netWorthItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', userId: 'u-1' },
      data: { note: null },
    });

    vi.clearAllMocks();
    prismaMock.netWorthItem.updateMany.mockResolvedValue({ count: 1 });

    await service().update('u-1', 'item-1', { valueCents: '1000' });
    const data = (prismaMock.netWorthItem.updateMany.mock.calls[0] as unknown[])[0] as {
      data: Record<string, unknown>;
    };
    expect(data.data).not.toHaveProperty('note');
  });

  it('aceita null no DTO de update (antes era 422)', async () => {
    const dto = plainToInstance(UpdateNetWorthItemDto, { note: null });
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);

    // String vazia continua inválida: use null para apagar.
    const empty = await validate(plainToInstance(UpdateNetWorthItemDto, { note: '' }));
    expect(empty.map((error) => error.property)).toContain('note');
  });
});
