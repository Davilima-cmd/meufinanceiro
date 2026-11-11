import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenFinanceController } from '../src/open-finance/open-finance.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
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
  bankConnection: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  consent: { findMany: ReturnType<typeof vi.fn> };
  syncJob: { create: ReturnType<typeof vi.fn> };
  webhookEvent: { create: ReturnType<typeof vi.fn> };
};

function makeController() {
  return new OpenFinanceController(prismaMock as unknown as PrismaService);
}

const req = (userId = 'user-1') => ({ user: { userId } } as any);

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
    prismaMock.bankConnection.create.mockResolvedValue({ id: 'bc-1' });
    await makeController().connect(req(), {
      provider: 'caju',
      providerAccountId: 'acc-123',
      accountId: 'acct-1',
    });
    expect(prismaMock.bankConnection.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        provider: 'caju',
        providerAccountId: 'acc-123',
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

  it('cria job de sincronização', async () => {
    prismaMock.syncJob.create.mockResolvedValue({ id: 'sj-1', status: 'pending' });
    const result = await makeController().triggerSync(req());
    expect(result).toEqual({ id: 'sj-1', status: 'pending' });
    expect(prismaMock.syncJob.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', status: 'pending' },
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
