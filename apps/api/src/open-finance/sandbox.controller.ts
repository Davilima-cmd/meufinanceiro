import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { asJson } from '../common/json';
import { isUniqueViolation } from '../common/prisma-errors';
import { OPEN_FINANCE_PROVIDER, OpenFinanceProvider } from './open-finance.provider';

interface WebhookBody {
  eventId?: string;
  event_id?: string;
  type?: string;
  payload?: unknown;
}

/**
 * Endpoints do provedor de sandbox do Open Finance.
 *
 * Exigem autenticação como qualquer outra rota: sem a guard, qualquer
 * cliente criaria consentimento para um `userId` arbitrário e injetaria
 * transações. Em produção o controller nem é registrado (ver
 * `open-finance.module.ts`) — o sandbox é exclusivo de desenvolvimento.
 */
@Controller('open-finance')
@UseGuards(AuthGuard('jwt'))
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
        externalId: this.prisma.encryptSensitive(consent.externalId) as string,
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
          payload: asJson(body),
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
