import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenFinanceController } from '../src/open-finance/open-finance.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { SyncService } from '../src/sync/sync.service';
import { HttpException, HttpStatus } from '@nestjs/common';

const prismaMock = {
  financialAccount: {
    findFirst: vi.fn(),
  },
  bankConnection: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  consent: {
    findMany: vi.fn(),
  },
  syncJob: {
    create: vi.fn(),
  },
  webhookEvent: {
    create: vi.fn().mockResolvedValue({}),
  },
} as unknown as {
  financialAccount: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  bankConnection: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  consent: { findMany: ReturnType<typeof vi.fn> };
  syncJob: { create: ReturnType<typeof vi.fn> };
  webhookEvent: { create: ReturnType<typeof vi.fn> };
};

/** Cifragem é explícita no PrismaService; o mock só precisa ser reversível. */
const cryptoMock = {
  encryptSensitive: vi.fn((value: string | null) => (value === null ? null : `enc:${value}`)),
  decryptSensitive: vi.fn((value: string | null) =>
    typeof value === 'string' && value.startsWith('enc:') ? value.slice(4) : value
  ),
};

const syncServiceMock = {
  reconcileUser: vi.fn(),
} as unknown as { reconcileUser: ReturnType<typeof vi.fn> };

function makeController() {
  return new OpenFinanceController(
    { ...prismaMock, ...cryptoMock } as unknown as PrismaService,
    syncServiceMock as unknown as SyncService
  );
}

const req = (userId = 'user-1') => ({ user: { userId } }) as any;

describe('OpenFinanceController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista conexões do usuário', async () => {
    prismaMock.bankConnection.findMany.mockResolvedValue([]);
    await makeController().listConnections(req());
    expect(prismaMock.bankConnection.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      select: expect.any(Object),
    });
  });

  it('conecta provedor vinculado ao usuário', async () => {
    prismaMock.financialAccount.findFirst.mockResolvedValue({ id: 'acct-1' });
    prismaMock.bankConnection.create.mockResolvedValue({ id: 'bc-1' });
    await makeController().connect(req(), {
      provider: 'caju',
      providerAccountId: 'acc-123',
      accountId: 'acct-1',
    });
    expect(prismaMock.financialAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'acct-1', userId: 'user-1' },
      select: { id: true },
    });
    expect(prismaMock.bankConnection.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        provider: 'caju',
        providerAccountId: 'enc:acc-123',
        accountId: 'acct-1',
        status: 'active',
      },
    });
  });

  it('revoga apenas conexão própria', async () => {
    prismaMock.bankConnection.update.mockResolvedValue({ id: 'bc-1', status: 'disconnected' });
    await makeController().revoke(req(), 'bc-1');
    expect(prismaMock.bankConnection.update).toHaveBeenCalledWith({
      where: { id: 'bc-1', userId: 'user-1' },
      data: { status: 'disconnected' },
    });
  });

  it('lista consents do usuário', async () => {
    prismaMock.consent.findMany.mockResolvedValue([]);
    await makeController().listConsents(req());
    expect(prismaMock.consent.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('dispara a reconciliação sob demanda (botão Sincronizar agora)', async () => {
    syncServiceMock.reconcileUser.mockResolvedValue({ id: 'sj-1', status: 'completed' });
    const result = await makeController().syncNow(req());
    expect(result).toEqual({ id: 'sj-1', status: 'completed' });
    expect(syncServiceMock.reconcileUser).toHaveBeenCalledWith('user-1', {
      trigger: 'manual',
    });
  });

  it('propaga o erro de limite de frequência do botão (429)', async () => {
    const error = new HttpException(
      { message: 'limite de frequência', retryAfter: 120 },
      HttpStatus.TOO_MANY_REQUESTS
    );
    syncServiceMock.reconcileUser.mockRejectedValue(error);
    await expect(makeController().syncNow(req())).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('webhook armazena evento e retorna recebido (sem auth)', async () => {
    const payload = { event_id: 'evt-1', data: {} };
    const result = await makeController().webhook('caju', payload, {} as any);
    expect(result).toStrictEqual({ received: true });
    expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith({
      data: {
        provider: 'caju',
        eventId: 'evt-1',
        payload,
        processed: false,
      },
    });
  });
});
