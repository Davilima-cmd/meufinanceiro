import {
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
import { centsToString, type DecimalLike } from '../common/money';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

interface BudgetWithCategory {
  id: string;
  userId: string;
  categoryId: string;
  amountCents: DecimalLike;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; color: string };
}

interface ExpenseRow {
  categoryId: string | null;
  amountCents: DecimalLike;
  date: Date;
}

@Controller('budgets')
@UseGuards(AuthGuard('jwt'))
export class BudgetsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const budgets: BudgetWithCategory[] = await this.prisma.budget.findMany({
      where: { userId },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { periodStart: 'desc' },
    });
    if (budgets.length === 0) return [];

    // Uma única consulta de despesas cobrindo o intervalo de todos os
    // orçamentos (evita N+1 de um aggregate por orçamento).
    const minStart = new Date(Math.min(...budgets.map((b) => b.periodStart.getTime())));
    const maxEnd = new Date(Math.max(...budgets.map((b) => b.periodEnd.getTime())));

    const expenses: ExpenseRow[] = await this.prisma.transaction.findMany({
      select: { categoryId: true, amountCents: true, date: true },
      where: {
        userId,
        type: 'expense',
        date: { gte: minStart, lte: maxEnd },
      },
    });

    const spentByCategory = new Map<string, Array<{ amountCents: number; date: Date }>>();
    for (const expense of expenses) {
      if (!expense.categoryId) continue; // sem categoria não afeta orçamento
      const bucket = spentByCategory.get(expense.categoryId) ?? [];
      bucket.push({
        amountCents: Number(centsToString(expense.amountCents)),
        date: expense.date,
      });
      spentByCategory.set(expense.categoryId, bucket);
    }

    return budgets.map((budget) => {
      // Despesas são gravadas com valor NEGATIVO; o gasto usa o módulo, senão
      // `spentCents` sairia negativo e `remainingCents` acima do limite.
      const spentCents = (spentByCategory.get(budget.categoryId) ?? [])
        .filter(
          (expense) =>
            expense.date.getTime() >= budget.periodStart.getTime() &&
            expense.date.getTime() <= budget.periodEnd.getTime()
        )
        .reduce((sum, expense) => sum + Math.abs(expense.amountCents), 0);
      const amountCents = Number(centsToString(budget.amountCents));
      return {
        id: budget.id,
        categoryId: budget.categoryId,
        amountCents: String(amountCents),
        periodStart: budget.periodStart,
        periodEnd: budget.periodEnd,
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt,
        spentCents: String(spentCents),
        remainingCents: String(amountCents - spentCents),
        category: budget.category,
      };
    });
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateBudgetDto) {
    // A categoria precisa existir e estar disponível para o usuário.
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, OR: [{ userId: req.user.userId }, { userId: null }] },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    const budget: BudgetWithCategory = await this.prisma.budget.create({
      data: {
        userId: req.user.userId,
        categoryId: category.id,
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
      amountCents: centsToString(budget.amountCents),
      spentCents: '0',
      remainingCents: centsToString(budget.amountCents),
    };
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto
  ) {
    // Chave composta sem `id` é inválida no Prisma: usamos updateMany para
    // filtrar por dono e depois buscamos o registro retornado.
    const updated = await this.prisma.budget.updateMany({
      where: { id, userId: req.user.userId },
      data: {
        ...(dto.amountCents !== undefined && { amountCents: dto.amountCents }),
        ...(dto.periodStart !== undefined && { periodStart: new Date(dto.periodStart) }),
        ...(dto.periodEnd !== undefined && { periodEnd: new Date(dto.periodEnd) }),
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Orçamento não encontrado');
    }

    const budget: BudgetWithCategory | null = await this.prisma.budget.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true, color: true } } },
    });
    if (!budget) {
      throw new NotFoundException('Orçamento não encontrado');
    }
    return { ...budget, amountCents: centsToString(budget.amountCents) };
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const deleted = await this.prisma.budget.deleteMany({
      where: { id, userId: req.user.userId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Orçamento não encontrado');
    }
    return { id };
  }
}
