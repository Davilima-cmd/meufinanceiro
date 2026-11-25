import { Body, Controller, Get, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/transaction.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';
import { centsToString, type DecimalLike } from '../common/money';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

/** Linha de transação com a conta relacionada (formato do select da consulta). */
interface TransactionWithAccount {
  id: string;
  accountId: string;
  userId: string;
  categoryId: string | null;
  description: string;
  amountCents: DecimalLike;
  type: string;
  origin: string;
  providerId: string | null;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  account: { id: string; name: string };
}

@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const transactions: TransactionWithAccount[] = await this.prisma.transaction.findMany({
      where: { userId: req.user.userId },
      orderBy: { date: 'desc' },
      include: {
        account: {
          select: { id: true, name: true },
        },
      },
    });

    return transactions.map((tx) => ({
      ...tx,
      amountCents: centsToString(tx.amountCents),
    }));
  }

  @Post()
  @AuditLog(AuditAction.TRANSACTION_CREATE)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTransactionDto) {
    // A conta de destino precisa pertencer ao usuário autenticado: sem esta
    // checagem, um usuário poderia lançar transações na conta de outro.
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: dto.accountId, userId: req.user.userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        accountId: account.id,
        userId: req.user.userId,
        description: dto.description,
        amountCents: String(dto.amountCents),
        type: dto.type,
        categoryId: dto.categoryId ?? null,
        origin: 'manual',
        date: new Date(dto.date),
      },
      include: {
        account: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      ...transaction,
      amountCents: centsToString(transaction.amountCents),
    };
  }
}
