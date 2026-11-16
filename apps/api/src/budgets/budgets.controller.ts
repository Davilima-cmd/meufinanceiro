import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
    if (budgets.length === 0) return [];

    // Gasto por categoria em uma única consulta, abrangendo o intervalo de
    // todos os orçamentos. Evita o N+1 de um `aggregate` por orçamento.
    const minStart = new Date(Math.min(...budgets.map((b) => b.periodStart.getTime())));
    const maxEnd = new Date(Math.max(...budgets.map((b) => b.periodEnd.getTime())));

    const expenses = await this.prisma.transaction.findMany({
      select: { categoryId: true, amountCents: true, date: true },
      where: {
        userId,
        type: 'expense',
        date: { gte: minStart, lte: maxEnd },
      },
    });

    // Agrupa despesas por categoria para leitura em memoria.
    const spentByCategory = new Map<string, Array<{ amountCents: number; date: Date }>>();
    for (const expense of expenses) {
      if (!expense.categoryId) continue; // sem categoria: nao afeta nenhum orcamento
      const bucket = spentByCategory.get(expense.categoryId) ?? [];
      bucket.push({
        amountCents: Number(String(expense.amountCents)),
        date: expense.date,
      });
      spentByCategory.set(expense.categoryId, bucket);
    }

    return budgets.map((budget) => {
      // As despesas são gravadas com `amountCents` NEGATIVO (o sinal carrega
      // o tipo: negativo = despesa, positivo = receita). Para o gasto do
      // orçamento usamos o valor absoluto — sem isso, `spentCents` saía
      // negativo e `remainingCents` ficava acima do limite.
      const spentCents = (spentByCategory.get(budget.categoryId) ?? [])
        .filter(
          (e) =>
            e.date.getTime() >= budget.periodStart.getTime() &&
            e.date.getTime() <= budget.periodEnd.getTime()
        )
        .reduce((sum, e) => sum + Math.abs(e.amountCents), 0);
      const remaining = Number(budget.amountCents) - spentCents;
      return {
        id: budget.id,
        categoryId: budget.categoryId,
        amountCents: budget.amountCents.toString(),
        periodStart: budget.periodStart,
        periodEnd: budget.periodEnd,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt,
        spentCents: spentCents.toString(),
        remainingCents: remaining.toString(),
        category: budget.category,
      };
    });
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    dto: {
      categoryId: string;
      amountCents: string;
      periodStart: string;
      periodEnd: string;
    }
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
    @Body()
    dto: {
      amountCents?: string;
      periodStart?: string;
      periodEnd?: string;
    }
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
