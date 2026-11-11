import { Body, Controller, Get, Inject, Post, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { OPEN_FINANCE_PROVIDER, OpenFinanceProvider } from './open-finance.provider';

interface WebhookBody {
  eventId?: string;
  event_id?: string;
  type?: string;
  payload?: unknown;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Controller('open-finance')
export class SandboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
    @Inject(OPEN_FINANCE_PROVIDER)
    private readonly provider: OpenFinanceProvider
  ) {}

  @Get('sandbox/accounts')
  async listAccounts() {
    return this.provider.listAccounts();
  }

  @Get('sandbox/transactions')
  async listTransactions() {
    return this.provider.listTransactions();
  }

  @Post('sandbox/consent')
  async createConsent(@Body() body: { userId: string }) {
    const consent = await this.provider.createConsent(body.userId);
    await this.prisma.consent.create({
      data: {
        userId: body.userId,
        provider: 'sandbox',
        externalId: consent.externalId,
        status: consent.status,
        expiresAt: consent.expiresAt,
      },
    });
    return consent;
  }

  @Post('sandbox/webhook')
  async receiveWebhook(@Body() body: WebhookBody) {
    const eventId = body.eventId ?? body.event_id;
    if (!eventId) {
      throw new BadRequestException('eventId é obrigatório');
    }

    // Idempotência: evento duplicado (eventId único) é ignorado no armazenamento.
    let event;
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          provider: 'sandbox',
          eventId,
          payload: body as unknown as Prisma.JsonObject,
          processed: false,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      event = await this.prisma.webhookEvent.findUnique({
        where: { eventId },
      });
      if (!event) {
        return { received: true, eventId };
      }
      if (event.processed) {
        return { received: true, eventId };
      }
    }

    await this.processEvent(event);
    return { received: true, eventId };
  }

  private async processEvent(event: {
    id: string;
    eventId: string;
    processed: boolean;
    payload: unknown;
  }): Promise<void> {
    if (event.processed) {
      return;
    }

    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processed: true },
    });

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const userId = payload.userId ?? null;
    if (userId) {
      // Dispara o processamento (reconciliação) do usuário dono do evento.
      await this.syncService.reconcileUser(String(userId), {
        trigger: 'daily',
      });
    }
  }
}
