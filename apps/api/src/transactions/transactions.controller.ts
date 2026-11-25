import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/transaction.dto';
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

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const rows = await this.transactions.list(req.user.userId);
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
