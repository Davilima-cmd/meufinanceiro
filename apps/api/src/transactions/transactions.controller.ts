import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/transaction.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('transactions')
@UseGuards(AuthGuard('jwt'))
export class TransactionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const transactions = await this.prisma.transaction.findMany({
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
      amountCents: tx.amountCents.toString(),
    }));
  }

  @Post()
  @AuditLog(AuditAction.TRANSACTION_CREATE)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTransactionDto,
  ) {
    const transaction = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
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
      amountCents: transaction.amountCents.toString(),
    };
  }
}
