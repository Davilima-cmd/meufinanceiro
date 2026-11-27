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

  /**
   * Vínculo manual de conta (rota legada) — **removida**.
   *
   * Ela criava `BankConnection` com `status: 'active'` a partir do corpo da
   * requisição: sem consentimento, sem `providerItemId` e sem nada no provedor.
   * O efeito aparecia depois, na conciliação: `fetchTransactions` recebia um
   * `providerAccountId` que não existe e a sincronização inteira do usuário
   * falhava — inclusive a das conexões que eram reais. O caminho correto é
   * `POST /open-finance/connect-item`, que confirma o item no provedor, checa o
   * consentimento e cria a conta com o saldo vindo da instituição.
   *
   * Para conta manual, o caminho é `POST /accounts` (com `balanceCents`); para
   * conta de instituição, o widget do provedor + `POST /open-finance/connect-item`.
   */

  @Patch('connections/:id/revoke')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_REVOKE)
  async revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    /**
     * `updateMany` com `userId` no filtro em vez de `update({ where: { id } })`.
     *
     * `update` com chave composta inexistente no Prisma devolve erro genérico
     * (500) e, quando o id é de outra pessoa, o `where` composto **não** é
     * garantia de nada: o certo é filtrar e checar a contagem. Revogar duas
     * vezes (duplo toque) deixa de ser erro.
     */
    const result = await this.prisma.bankConnection.updateMany({
      where: { id, userId: req.user.userId },
      data: { status: 'disconnected' },
    });
    if (result.count === 0) {
      throw new NotFoundException('Conexão não encontrada');
    }
    return { id, status: 'disconnected' };
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
