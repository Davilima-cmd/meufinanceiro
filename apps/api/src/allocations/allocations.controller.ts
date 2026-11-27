import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AllocationsService } from './allocations.service';
import { SettleAllocationDto, UpsertAllocationDto } from './dto/allocation.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

/**
 * Pesos do rateio como números finitos e positivos.
 *
 * `IsObject` garante objeto, não garante valores: `{"a": "1e999"}` passaria pelo
 * pipe e explodiria dentro do `splitAmount`. Aqui o formato errado vira 400.
 */
function sanitizeWeights(weights?: Record<string, unknown>): Record<string, number> | undefined {
  if (!weights) return undefined;
  const entries = Object.entries(weights);
  if (entries.length > 50) {
    throw new BadRequestException('Rateio com pesos demais.');
  }
  const result: Record<string, number> = {};
  for (const [key, value] of entries) {
    const numeric = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new BadRequestException(`Peso inválido para o participante ${key}.`);
    }
    result[key] = numeric;
  }
  return result;
}

/**
 * Intervalo de competência a partir de `?from`/`?to` (data pura AAAA-MM-DD).
 *
 * Antes, `new Date(...)` direto nos dois campos aceitava qualquer coisa: texto
 * inválido virava `Invalid Date` e a consulta ao banco estourava com 500 em vez
 * de 400. E `?to=2026-11-30T10:00:00Z`, ou simplesmente o dia com hora, deixava
 * o lançamento do próprio dia 30 de fora quando era comparado com `lte`.
 * Agora: formato validado, e `to` sempre fecha no **fim** do dia informado.
 */
export function parsePeriod(query: { from?: string; to?: string }, now = new Date()) {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Campo ausente ou vazio = padrão (mês corrente). Qualquer outro valor
  // precisa ser uma data válida.
  const from = query.from?.trim() ? parseDay(query.from, 'from', false) : startOfMonth;
  const to = query.to?.trim() ? parseDay(query.to, 'to', true) : endOfMonth;

  if (from.getTime() > to.getTime()) {
    throw new BadRequestException('O início do período não pode ser depois do fim.');
  }
  return { from, to };
}

function parseDay(value: string, field: string, endOfDay: boolean): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new BadRequestException(`Data inválida em "${field}". Use AAAA-MM-DD.`);
  }
  const [, year, month, day] = match;
  const date = endOfDay
    ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
    : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  // `new Date(2026, 1, 31)` vira 3 de março: aqui isso é recusado. Getters
  // locais, porque a data foi montada no fuso local do servidor.
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    throw new BadRequestException(`Data inexistente em "${field}": ${value}.`);
  }
  return date;
}

@Controller('allocations')
@UseGuards(AuthGuard('jwt'))
export class AllocationsController {
  constructor(private readonly allocations: AllocationsService) {}

  /** Rateio de um lançamento. */
  @Get('transactions/:id')
  async list(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.allocations.list(req.user.userId, id);
  }

  /** Cria/refaz o rateio. Só o dono do lançamento. */
  @Put('transactions/:id')
  @AuditLog(AuditAction.ALLOCATION_UPSERT)
  async upsert(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpsertAllocationDto
  ) {
    return this.allocations.upsert(req.user.userId, id, {
      participants: dto.participants,
      mode: dto.mode,
      // Sanitização final: `IsObject` aceita `{ a: "x" }`. Chave numérica
      // estranha vira 400 aqui, em vez de BigInt inválido (500) no meio do
      // cálculo de rateio.
      weights: sanitizeWeights(dto.weights),
    });
  }

  /** Marca a parte de um participante como acertada. */
  @Post('transactions/:id/settle')
  @AuditLog(AuditAction.ALLOCATION_SETTLE)
  async settle(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SettleAllocationDto
  ) {
    return this.allocations.settle(req.user.userId, id, dto.participantId);
  }

  /** Quanto cada pessoa deve no período (`?from=YYYY-MM-DD&to=YYYY-MM-DD`). */
  @Get('summary')
  async summary(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    const period = parsePeriod({ from, to });
    return this.allocations.summary(req.user.userId, period.from, period.to);
  }
}
