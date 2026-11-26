import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';
import { asJson } from '../common/json';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

interface BankConnectionRow {
  providerAccountId: string | null;
  [key: string]: unknown;
}

interface ConsentRow {
  externalId: string | null;
  [key: string]: unknown;
}

@Controller('open-finance')
export class OpenFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService
  ) {}

  @Get('connections')
  @UseGuards(AuthGuard('jwt'))
  async listConnections(@Req() req: AuthenticatedRequest) {
    const connections = await this.prisma.bankConnection.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        status: true,
        consentId: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        account: { select: { id: true, name: true } },
      },
    });

    return connections.map((connection: BankConnectionRow) => ({
      ...connection,
      providerAccountId:
        this.prisma.decryptSensitive(connection.providerAccountId) ?? connection.providerAccountId,
    }));
  }

  @Post('connections')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_CONNECT)
  async connect(
    @Req() req: AuthenticatedRequest,
    @Body()
    dto: { provider: string; providerAccountId: string; accountId: string }
  ) {
    // A conta vinculada precisa pertencer ao usuário autenticado: sem esta
    // checagem, um usuário poderia apontar a conexão para a conta de outro.
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: dto.accountId, userId: req.user.userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    const connection = await this.prisma.bankConnection.create({
      data: {
        userId: req.user.userId,
        provider: dto.provider,
        providerAccountId: this.prisma.encryptSensitive(dto.providerAccountId) as string,
        accountId: account.id,
        status: 'active',
      },
    });

    return {
      ...connection,
      providerAccountId: this.prisma.decryptSensitive(connection.providerAccountId),
    };
  }

  @Patch('connections/:id/revoke')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_REVOKE)
  async revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const connection = await this.prisma.bankConnection.update({
      where: { id, userId: req.user.userId },
      data: { status: 'disconnected' },
    });

    return {
      ...connection,
      providerAccountId: this.prisma.decryptSensitive(connection.providerAccountId),
    };
  }

  @Get('consents')
  @UseGuards(AuthGuard('jwt'))
  async listConsents(@Req() req: AuthenticatedRequest) {
    const consents = await this.prisma.consent.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });

    return consents.map((consent: ConsentRow) => ({
      ...consent,
      externalId: this.prisma.decryptSensitive(consent.externalId),
    }));
  }

  @Post('sync')
  @UseGuards(AuthGuard('jwt'))
  async syncNow(@Req() req: AuthenticatedRequest) {
    return this.syncService.reconcileUser(req.user.userId, {
      trigger: 'manual',
    });
  }

  @Post('reconcile')
  @UseGuards(AuthGuard('jwt'))
  async reconcile(@Req() req: AuthenticatedRequest) {
    return this.syncService.reconcileUser(req.user.userId, {
      trigger: 'manual',
    });
  }

  /**
   * Recebe eventos do provedor Open Finance.
   *
   * Sem autenticação: a origem é o provedor, não o usuário. A integridade é
   * garantida por assinatura HMAC-SHA256 do corpo bruto, comparada em tempo
   * constante. `OPEN_FINANCE_WEBHOOK_SECRET` é obrigatória em produção.
   */
  @Post('webhooks/:provider')
  async webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Req() req: IncomingMessage & { rawBody?: Buffer }
  ) {
    this.verifyWebhookSignature(req, payload);

    const eventId =
      typeof payload === 'object' &&
      payload !== null &&
      'event_id' in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>)['event_id'])
        : randomUUID();
    // Idempotência: evento duplicado é ignorado silenciosamente.
    await this.prisma.webhookEvent
      .create({
        data: {
          provider,
          eventId,
          payload: asJson(payload),
          processed: false,
        },
      })
      .catch(() => undefined);
    return { received: true };
  }

  /** Confere a assinatura HMAC do webhook; falha fechado quando não há segredo. */
  private verifyWebhookSignature(
    req: IncomingMessage & { rawBody?: Buffer },
    payload: unknown
  ): void {
    const secret = process.env.OPEN_FINANCE_WEBHOOK_SECRET?.trim();

    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Webhook desabilitado: segredo não configurado');
      }
      return; // desenvolvimento: sandbox local sem assinatura
    }

    const header = req.headers['x-webhook-signature'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided) {
      throw new UnauthorizedException('Assinatura do webhook ausente');
    }

    const body = req.rawBody?.toString('utf8') ?? JSON.stringify(payload ?? {});
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Assinatura do webhook inválida');
    }
  }
}
