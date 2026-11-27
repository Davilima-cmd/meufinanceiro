import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { SkipCsrf } from '../common/skip-csrf.decorator';
import { RecurrencesService } from '../recurrences/recurrences.service';
import { SyncService } from '../sync/sync.service';

/**
 * Tarefas periódicas em ambiente serverless.
 *
 * O `SyncModule` já agenda as rotinas internas com `setInterval` de 1 hora —
 * isso funciona em container (Docker/Azure), mas **não na Vercel**: cada
 * requisição é uma invocação curta e o processo morre depois dela, então o
 * timer nunca dispara mais de uma vez. Na prática, recorrências e
 * reconciliação diária simplesmente não rodavam em produção.
 *
 * Aqui a mesma rotina fica exposta numa rota que um cron externo chama. A
 * autenticação é por segredo compartilhado (`CRON_SECRET`), não por JWT de
 * usuário: cron não tem sessão. Sem `CRON_SECRET` configurado a rota responde
 * 404 (não existe), em vez de ficar aberta.
 */

/** Comparação em tempo constante — o segredo não pode vazar byte a byte. */
function secretMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CRON_SECRET?.trim();
    // Sem segredo configurado a rota não deve existir: 404 em vez de 401,
    // porque nem confirmamos que o endpoint está montado.
    if (!expected) {
      throw new NotFoundException('Not found');
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw =
      request.headers['x-cron-secret'] ??
      // A Vercel manda `Authorization: Bearer $CRON_SECRET` nos crons dela.
      (typeof request.headers.authorization === 'string'
        ? request.headers.authorization.replace(/^Bearer\s+/i, '')
        : undefined);
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (!provided || !secretMatches(expected, provided)) {
      throw new UnauthorizedException('Credencial de cron inválida.');
    }
    return true;
  }
}

@Controller('cron')
@SkipCsrf()
export class CronController {
  constructor(
    private readonly recurrences: RecurrencesService,
    private readonly sync: SyncService
  ) {}

  /**
   * Roda as tarefas periódicas: gera lançamentos de recorrência vencidos de
   * **todos** os usuários e reconcilia os bancos conectados há mais de 24h.
   *
   * É idempotente (o cursor `nextRunAt` avança na mesma transação da criação),
   * então chamar duas vezes no mesmo dia não duplica lançamento.
   */
  @Post('daily')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CronSecretGuard)
  async daily() {
    const recurrences = await this.recurrences.run();
    await this.sync.runDailyReconciliation();
    return { ok: true, recurrencesCreated: recurrences.created };
  }

  /** Mesma rotina por GET, para crons que só fazem requisição simples. */
  @Get('daily')
  @UseGuards(CronSecretGuard)
  async dailyGet() {
    return this.daily();
  }

  /** Diagnóstico: confirma que a rota existe e o segredo está configurado. */
  @Get('status')
  @UseGuards(CronSecretGuard)
  status() {
    return { ok: true, secretConfigured: Boolean(process.env.CRON_SECRET?.trim()) };
  }
}
