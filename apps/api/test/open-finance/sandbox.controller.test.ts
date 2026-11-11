import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SyncService } from '../../src/sync/sync.service';
import { SandboxController } from '../../src/open-finance/sandbox.controller';

const providerMock = {
  listAccounts: vi.fn(),
  listTransactions: vi.fn(),
  createConsent: vi.fn(),
} as unknown as {
  listAccounts: ReturnType<typeof vi.fn>;
  listTransactions: ReturnType<typeof vi.fn>;
  createConsent: ReturnType<typeof vi.fn>;
};

const syncMock = {
  reconcileUser: vi.fn(),
} as unknown as { reconcileUser: ReturnType<typeof vi.fn> };

const prismaMock = {
  consent: {
    create: vi.fn(),
  },
  webhookEvent: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
  },
} as unknown as {
  consent: { create: ReturnType<typeof vi.fn> };
  webhookEvent: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  transaction: { create: ReturnType<typeof vi.fn> };
};

function makeController() {
  return new SandboxController(
    prismaMock as unknown as PrismaService,
    syncMock as unknown as SyncService,
    providerMock
  );
}

const baseEvent = {
  id: 'we-1',
  eventId: 'evt-1',
  processed: false,
  payload: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  providerMock.listAccounts.mockResolvedValue([
    {
      id: 'sandbox-account-1',
      name: 'Conta Corrente Sandbox',
      institution: 'Sandbox Bank',
      type: 'checking',
      currency: 'BRL',
      balanceCents: '543210',
    },
  ]);
  providerMock.listTransactions.mockResolvedValue([]);
  providerMock.createConsent.mockResolvedValue({
    id: 'c-1',
    externalId: 'sandbox_consent_ext',
    status: 'active',
    expiresAt: new Date('2026-12-01T00:00:00-03:00'),
  });
  prismaMock.webhookEvent.create.mockResolvedValue(baseEvent);
  prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
  prismaMock.webhookEvent.update.mockResolvedValue({});
  prismaMock.transaction.create.mockResolvedValue({});
  prismaMock.consent.create.mockResolvedValue({});
});

describe('SandboxController', () => {
  describe('GET /open-finance/sandbox/accounts', () => {
    it('lista contas do provedor sandbox', async () => {
      const result = await makeController().listAccounts();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sandbox-account-1');
      expect(providerMock.listAccounts).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /open-finance/sandbox/transactions', () => {
    it('lista transações do provedor sandbox', async () => {
      const result = await makeController().listTransactions();
      expect(result).toEqual([]);
      expect(providerMock.listTransactions).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /open-finance/sandbox/consent', () => {
    it('cria consentimento via provedor e persiste no banco', async () => {
      const result = await makeController().createConsent({ userId: 'u-1' });
      expect(result).toEqual({
        id: 'c-1',
        externalId: 'sandbox_consent_ext',
        status: 'active',
        expiresAt: new Date('2026-12-01T00:00:00-03:00'),
      });
      expect(providerMock.createConsent).toHaveBeenCalledWith('u-1');
      expect(prismaMock.consent.create).toHaveBeenCalledWith({
        data: {
          userId: 'u-1',
          provider: 'sandbox',
          externalId: 'sandbox_consent_ext',
          status: 'active',
          expiresAt: new Date('2026-12-01T00:00:00-03:00'),
        },
      });
    });
  });

  describe('POST /open-finance/sandbox/webhook', () => {
    it('armazena evento, dispara processamento e retorna recebido', async () => {
      const payload = {
        userId: 'u-1',
      };
      prismaMock.webhookEvent.create.mockResolvedValue({
        ...baseEvent,
        payload,
      });

      const result = await makeController().receiveWebhook({
        eventId: 'evt-1',
        payload,
      });

      expect(result).toEqual({ received: true, eventId: 'evt-1' });
      expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith({
        data: {
          provider: 'sandbox',
          eventId: 'evt-1',
          payload: { eventId: 'evt-1', payload },
          processed: false,
        },
      });
      expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'we-1' },
        data: { processed: true },
      });
      expect(syncMock.reconcileUser).toHaveBeenCalledWith('u-1', {
        trigger: 'daily',
      });
    });

    it('evento duplicado já processado não reprocessa', async () => {
      prismaMock.webhookEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.19.3',
        })
      );
      prismaMock.webhookEvent.findUnique.mockResolvedValue({
        ...baseEvent,
        processed: true,
      });

      const result = await makeController().receiveWebhook({
        eventId: 'evt-1',
      });

      expect(result).toEqual({ received: true, eventId: 'evt-1' });
      expect(prismaMock.webhookEvent.findUnique).toHaveBeenCalledWith({
        where: { eventId: 'evt-1' },
      });
      expect(prismaMock.webhookEvent.update).not.toHaveBeenCalled();
      expect(syncMock.reconcileUser).not.toHaveBeenCalled();
    });

    it('evento duplicado não processado é processado uma vez', async () => {
      prismaMock.webhookEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.19.3',
        })
      );
      prismaMock.webhookEvent.findUnique.mockResolvedValue({
        ...baseEvent,
        payload: { userId: 'u-1' },
      });

      await makeController().receiveWebhook({ eventId: 'evt-1' });

      expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'we-1' },
        data: { processed: true },
      });
      expect(syncMock.reconcileUser).toHaveBeenCalledWith('u-1', {
        trigger: 'daily',
      });
    });

    it('rejeita webhook sem eventId', async () => {
      await expect(makeController().receiveWebhook({})).rejects.toThrow(BadRequestException);
      expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled();
    });
  });
});
