import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';
import {
  CreateTransactionDto,
  SettleTransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';
import { centsToString } from '../common/money';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

/** Converte os `Decimal` do Prisma em string de centavos antes de responder. */
function toJson<T extends { amountCents: unknown }>(row: T) {
  return { ...row, amountCents: centsToString(row.amountCents as never) };
}

@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  /** `?status=pending` filtra por situação; `?overdue=true` traz só os atrasados. */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('overdue') overdue?: string
  ) {
    const rows = await this.transactions.list(req.user.userId, {
      status: status && status !== 'all' ? status : undefined,
      overdue: overdue === 'true' || overdue === '1',
    });
    return rows.map(toJson);
  }

  @Post()
  @AuditLog(AuditAction.TRANSACTION_CREATE)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTransactionDto) {
    const created = await this.transactions.create(req.user.userId, dto);
    if ('transactions' in created) {
      return { ...created, transactions: created.transactions.map(toJson) };
    }
    return toJson(created);
  }

  /** Corrige um lançamento existente; se já liquidado, o saldo acompanha o delta. */
  @Patch(':id')
  @AuditLog(AuditAction.TRANSACTION_UPDATE)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto
  ) {
    return toJson(await this.transactions.update(req.user.userId, id, dto));
  }

  /** Liquida um pendente (a pagar/receber): é aqui que o saldo passa a contar. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/settle')
  @AuditLog(AuditAction.TRANSACTION_SETTLE)
  async settle(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SettleTransactionDto
  ) {
    return toJson(await this.transactions.settle(req.user.userId, id, dto.paidAt));
  }

  /** Cancela um pendente sem efeito no saldo (desistiu de pagar/receber). */
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  @AuditLog(AuditAction.TRANSACTION_UPDATE)
  async cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return toJson(await this.transactions.cancel(req.user.userId, id));
  }

  @Post(':id/reverse')
  @AuditLog(AuditAction.TRANSACTION_CREATE)
  async reverse(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return toJson(await this.transactions.reverse(req.user.userId, id));
  }

  @Delete(':id')
  @AuditLog(AuditAction.TRANSACTION_DELETE)
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.transactions.remove(req.user.userId, id);
  }
}
