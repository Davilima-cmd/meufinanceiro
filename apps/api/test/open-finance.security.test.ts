import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { OpenFinanceController } from '../src/open-finance/open-finance.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const prismaMock = {
  bankConnection: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  financialAccount: {
    findFirst: vi.fn(),
  },
  consent: { findMany: vi.fn() },
  webhookEvent: { create: vi.fn() },
} as unknown as PrismaService;

const syncMock = { reconcileUser: vi.fn() } as any;

function makeController() {
  return new OpenFinanceController(prismaMock as unknown as PrismaService, syncMock);
}

const req = (userId = 'user-1') => ({ user: { userId } }) as any;

function signRequest(body: string, secret: string) {
  return {
    headers: { 'x-webhook-signature': createHmac('sha256', secret).update(body).digest('hex') },
    rawBody: Buffer.from(body, 'utf8'),
  };
}

describe('OpenFinanceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPEN_FINANCE_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.OPEN_FINANCE_WEBHOOK_SECRET;
  });

  it('rejeita conectar a uma conta que não pertence ao usuário', async () => {
    (prismaMock.financialAccount.findFirst as any).mockResolvedValue(null);

    await expect(
      makeController().connect(req('user-1'), {
        provider: 'bank',
        providerAccountId: 'acc-1',
        accountId: 'conta-de-outro',
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.bankConnection.create).not.toHaveBeenCalled();
  });

  it('conecta quando a conta pertence ao usuário', async () => {
    (prismaMock.financialAccount.findFirst as any).mockResolvedValue({ id: 'conta-1' });
    (prismaMock.bankConnection.create as any).mockResolvedValue({ id: 'bc-1' });

    await makeController().connect(req('user-1'), {
      provider: 'bank',
      providerAccountId: 'acc-1',
      accountId: 'conta-1',
    });

    expect(prismaMock.bankConnection.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        provider: 'bank',
        providerAccountId: 'acc-1',
        accountId: 'conta-1',
        status: 'active',
      },
    });
  });

  it('rejeita webhook sem assinatura quando há segredo configurado', async () => {
    process.env.OPEN_FINANCE_WEBHOOK_SECRET = 'segredo-de-teste';

    await expect(
      makeController().webhook('bank', { event_id: 'e1' }, { headers: {} } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita webhook com assinatura invalida', async () => {
    process.env.OPEN_FINANCE_WEBHOOK_SECRET = 'segredo-de-teste';

    await expect(
      makeController().webhook('bank', { event_id: 'e1' }, {
        headers: { 'x-webhook-signature': 'invalida' },
        rawBody: Buffer.from('{}'),
      } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita evento maior que o teto (enchimento de webhook_events)', async () => {
    // Sem assinatura em desenvolvimento: o limite de tamanho não depende dela.
    const grande = { event_id: 'e1', filler: 'x'.repeat(65 * 1024) };

    await expect(makeController().webhook('bank', grande, {} as any)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('rejeita provider fora do formato em vez de criar chave arbitrária', async () => {
    await expect(
      makeController().webhook('../../etc/passwd', { event_id: 'e1' }, {} as any)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('aceita webhook com assinatura valida', async () => {
    process.env.OPEN_FINANCE_WEBHOOK_SECRET = 'segredo-de-teste';
    const body = JSON.stringify({ event_id: 'e1' });
    (prismaMock.webhookEvent.create as any).mockResolvedValue({ id: 'w1' });

    await expect(
      makeController().webhook(
        'bank',
        { event_id: 'e1' },
        signRequest(body, 'segredo-de-teste') as any
      )
    ).resolves.toEqual({ received: true });
  });
});
