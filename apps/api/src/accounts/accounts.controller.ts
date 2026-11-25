import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/account.dto';
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

@Controller('accounts')
@UseGuards(AuthGuard('jwt'))
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const accounts: AccountRow[] = await this.prisma.financialAccount.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        institution: true,
        type: true,
        currency: true,
        balanceCents: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return accounts.map((account) => ({
      ...account,
      balanceCents: centsToString(account.balanceCents),
    }));
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAccountDto) {
    const account = await this.prisma.financialAccount.create({
      data: {
        name: dto.name,
        institution: dto.institution ?? null,
        type: dto.type ?? 'manual',
        currency: dto.currency ?? 'BRL',
        balanceCents: 0,
        userId: req.user.userId,
      },
      select: {
        id: true,
        name: true,
        institution: true,
        type: true,
        currency: true,
        balanceCents: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...account,
      balanceCents: centsToString(account.balanceCents),
    };
  }
}
