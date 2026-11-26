import {
  BadRequestException,
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
import { Throttle } from '@nestjs/throttler';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';
import { asJson } from '../common/json';
import { ConnectConnectionDto } from './dto/connect-connection.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

/** Evento de webhook acima disso é abuso, não notificação. */
const WEBHOOK_MAX_PAYLOAD_BYTES = 64 * 1024;

/**
 * Formato aceito no `:provider` do webhook.
 *
 * Não é uma lista fechada (novo provedor não pode exigir deploy), mas impede
 * que o path vire chave arbitrária — sem isso, qualquer string criava linha em
 * `webhook_events`.
 */
const WEBHOOK_PROVIDER_PATTERN = /^[a-z0-9_-]{1,32}$/;

@Controller('open-finance')
export class OpenFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService
  ) {}

  @Get('connections')
  @UseGuards(AuthGuard('jwt'))
  async listConnections(@Req() req: AuthenticatedRequest) {
    return this.prisma.bankConnection.findMany({
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
  }

  @Post('connections')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_CONNECT)
  async connect(@Req() req: AuthenticatedRequest, @Body() dto: ConnectConnectionDto) {
    // A conta vinculada precisa pertencer ao usuário autenticado: sem esta
    // checagem, um usuário poderia apontar a conexão para a conta de outro.
    const account = await this.prisma.financialAccount.findFirst({
      // Conta excluída logicamente não aceita conexão nova.
      where: { id: dto.accountId, userId: req.user.userId, deletedAt: null },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    return this.prisma.bankConnection.create({
      data: {
        userId: req.user.userId,
        provider: dto.provider,
        providerAccountId: dto.providerAccountId,
        accountId: account.id,
        status: 'active',
      },
    });
  }

  @Patch('connections/:id/revoke')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_REVOKE)
  async revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.prisma.bankConnection.update({
      where: { id, userId: req.user.userId },
      data: { status: 'disconnected' },
    });
  }

  @Get('consents')
  @UseGuards(AuthGuard('jwt'))
  async listConsents(@Req() req: AuthenticatedRequest) {
    return this.prisma.consent.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
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
  // Protegida contra força bruta na assinatura: um atacante que tente adivinhar
  // o HMAC não pode usar esse endpoint como oráculo sem limite.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Req() req: IncomingMessage & { rawBody?: Buffer }
  ) {
    this.verifyWebhookSignature(req, payload);

    /**
     * Teto de tamanho do evento.
     *
     * O parser global já limita o corpo a 1 MB, mas o `payload` é gravado
     * inteiro em `webhook_events`: a 120 req/min, isso enche o banco com dados
     * de quem nem precisa da assinatura no ambiente de desenvolvimento. Um
     * evento real de Open Finance tem poucos KB.
     */
    if (Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8') > WEBHOOK_MAX_PAYLOAD_BYTES) {
      throw new BadRequestException('Evento maior que o permitido');
    }

    // `provider` é chave de consulta e sai do path: restringir evita criar uma
    // linha por nome arbitrário (`/webhooks/qualquer-coisa`).
    if (!WEBHOOK_PROVIDER_PATTERN.test(provider)) {
      throw new BadRequestException('Provedor inválido');
    }

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
