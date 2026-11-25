import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { centsToString, type DecimalLike } from '../common/money';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

interface AccountRow {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  currency: string;
  balanceCents: DecimalLike;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  institution: true,
  type: true,
  currency: true,
  balanceCents: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toJson(account: AccountRow) {
  return { ...account, balanceCents: centsToString(account.balanceCents) };
}

@Controller('accounts')
@UseGuards(AuthGuard('jwt'))
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const accounts: AccountRow[] = await this.prisma.financialAccount.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: ACCOUNT_SELECT,
    });

    return accounts.map(toJson);
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAccountDto) {
    const initial = BigInt(dto.balanceCents ?? '0');

    const account: AccountRow = await this.prisma.$transaction(async (tx: PrismaService) => {
      const created: AccountRow = await tx.financialAccount.create({
        data: {
          name: dto.name,
          institution: dto.institution ?? null,
          type: dto.type ?? 'manual',
          currency: dto.currency ?? 'BRL',
          balanceCents: initial.toString(),
          userId: req.user.userId,
        },
        select: ACCOUNT_SELECT,
      });

      // O saldo inicial entra como movimento, para o histórico explicar o saldo.
      if (initial !== 0n) {
        await tx.transaction.create({
          data: {
            accountId: created.id,
            userId: req.user.userId,
            description: 'Saldo inicial',
            amountCents: initial.toString(),
            type: initial > 0n ? 'income' : 'expense',
            origin: 'manual',
            date: new Date(),
          },
        });
      }

      return created;
    });

    return toJson(account);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto
  ) {
    const result = await this.prisma.financialAccount.updateMany({
      where: { id, userId: req.user.userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.institution !== undefined ? { institution: dto.institution } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException('Conta não encontrada');

    const account: AccountRow | null = await this.prisma.financialAccount.findFirst({
      where: { id, userId: req.user.userId },
      select: ACCOUNT_SELECT,
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
    return toJson(account);
  }

  /**
   * Remove a conta somente quando ela não tem histórico. Com lançamentos, a
   * operação correta é arquivar (`PATCH { isActive: false }`), para não apagar
   * movimentações financeiras.
   */
  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id, userId: req.user.userId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');

    const movements = await this.prisma.transaction.count({ where: { accountId: id } });
    if (movements > 0) {
      throw new BadRequestException(
        'Conta com lançamentos não pode ser excluída. Arquive a conta para manter o histórico.'
      );
    }

    await this.prisma.financialAccount.delete({ where: { id } });
    return { deleted: 1 };
  }
}
