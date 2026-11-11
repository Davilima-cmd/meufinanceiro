import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('budgets')
@UseGuards(AuthGuard('jwt'))
export class BudgetsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      budgets.map(async (budget) => {
        const spent = await this.prisma.transaction.aggregate({
          where: {
            userId,
            categoryId: budget.categoryId,
            type: 'expense',
            date: { gte: budget.periodStart, lte: budget.periodEnd },
          },
          _sum: { amountCents: true },
        });
        const spentCents = spent._sum.amountCents
          ? spent._sum.amountCents.toString()
          : '0';
        const remaining = Number(budget.amountCents) - Number(spentCents);
        return {
          id: budget.id,
          categoryId: budget.categoryId,
          amountCents: budget.amountCents.toString(),
          periodStart: budget.periodStart,
          periodEnd: budget.periodEnd,
          createdAt: budget.createdAt,
          updatedAt: budget.updatedAt,
          spentCents,
          remainingCents: remaining.toString(),
          category: budget.category,
        };
      }),
    );
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: {
      categoryId: string;
      amountCents: string;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    const budget = await this.prisma.budget.create({
      data: {
        userId: req.user.userId,
        categoryId: dto.categoryId,
        amountCents: dto.amountCents,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
    });
    return {
      ...budget,
      amountCents: budget.amountCents.toString(),
    };
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: {
      amountCents?: string;
      periodStart?: string;
      periodEnd?: string;
    },
  ) {
    const budget = await this.prisma.budget.update({
      where: { id, userId: req.user.userId },
      data: {
        ...(dto.amountCents !== undefined && { amountCents: dto.amountCents }),
        ...(dto.periodStart !== undefined && {
          periodStart: new Date(dto.periodStart),
        }),
        ...(dto.periodEnd !== undefined && {
          periodEnd: new Date(dto.periodEnd),
        }),
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
    });
    return {
      ...budget,
      amountCents: budget.amountCents.toString(),
    };
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.prisma.budget.delete({
      where: { id, userId: req.user.userId },
    });
    return { id };
  }
}
