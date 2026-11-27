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
import { centsToString, type DecimalLike } from '../common/money';
import { CreateGoalDto, GoalContributionDto, UpdateGoalDto } from './dto/goal.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

interface GoalRow {
  id: string;
  userId: string;
  name: string;
  targetCents: DecimalLike;
  currentCents: DecimalLike;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `current / target` como fração (0 quando o alvo é zero/negativo). */
function progressRatio(currentCentavos: DecimalLike, targetCentavos: DecimalLike): number {
  const target = BigInt(centsToString(targetCentavos));
  if (target <= 0n) return 0;
  const current = BigInt(centsToString(currentCentavos));
  return Math.round((Number(current) / Number(target)) * 10000) / 10000;
}

@Controller('financial-goals')
@UseGuards(AuthGuard('jwt'))
export class FinancialGoalsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const goals: GoalRow[] = await this.prisma.financialGoal.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    return goals.map((goal) => ({
      ...goal,
      targetCents: centsToString(goal.targetCents),
      currentCents: centsToString(goal.currentCents),
      // Fração calculada em centavos inteiros: `Number(Decimal)` em valores
      // grandes perde precisão e um alvo de R$ 10.000.000,00 dava progresso
      // errado no arredondamento.
      progress: progressRatio(goal.currentCents, goal.targetCents),
    }));
  }

  /**
   * Aportes da meta, do mais recente para o mais antigo.
   *
   * O saldo da meta é a soma dos aportes (resgates entram negativos), então
   * esta lista **é** o histórico que explica o `currentCents`.
   */
  @Get(':id/contributions')
  async contributions(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.assertOwned(req.user.userId, id);
    const rows: Array<{
      id: string;
      amountCents: DecimalLike;
      note: string | null;
      occurredAt: Date;
    }> = await this.prisma.goalContribution.findMany({
      where: { goalId: id },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, amountCents: true, note: true, occurredAt: true },
    });
    return rows.map((row) => ({ ...row, amountCents: centsToString(row.amountCents) }));
  }

  /**
   * Registra um aporte (ou resgate, com valor negativo) e atualiza o saldo da
   * meta na mesma transação — sem isso o histórico e o progresso divergem.
   */
  @Post(':id/contributions')
  async addContribution(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: GoalContributionDto
  ) {
    await this.assertOwned(req.user.userId, id);
    const amount = BigInt(dto.amountCents);
    if (amount === 0n) throw new BadRequestException('Informe um valor diferente de zero.');
    if (dto.amountCents.length > 19) throw new BadRequestException('Valor inválido.');

    const goal = await this.prisma.$transaction(async (tx) => {
      await tx.goalContribution.create({
        data: {
          goalId: id,
          amountCents: amount.toString(),
          note: dto.note ?? null,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        },
      });
      return tx.financialGoal.update({
        where: { id },
        data: { currentCents: { increment: amount } },
      });
    });

    return {
      ...goal,
      targetCents: centsToString(goal.targetCents),
      currentCents: centsToString(goal.currentCents),
    };
  }

  /** Remove um aporte lançado errado e devolve o valor ao saldo da meta. */
  @Delete(':id/contributions/:contributionId')
  async removeContribution(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('contributionId') contributionId: string
  ) {
    await this.assertOwned(req.user.userId, id);
    const contribution = await this.prisma.goalContribution.findFirst({
      where: { id: contributionId, goalId: id },
      select: { amountCents: true },
    });
    if (!contribution) throw new NotFoundException('Aporte não encontrado');

    const goal = await this.prisma.$transaction(async (tx) => {
      await tx.goalContribution.delete({ where: { id: contributionId } });
      return tx.financialGoal.update({
        where: { id },
        data: { currentCents: { decrement: BigInt(centsToString(contribution.amountCents)) } },
      });
    });

    return {
      ...goal,
      targetCents: centsToString(goal.targetCents),
      currentCents: centsToString(goal.currentCents),
    };
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateGoalDto) {
    const target = BigInt(dto.targetCents);
    if (target <= 0n) {
      throw new BadRequestException('O valor alvo da meta deve ser maior que zero.');
    }
    const initial = dto.currentCents ? BigInt(dto.currentCents) : 0n;

    // O saldo da meta tem que ser explicado pelos aportes: o valor inicial da
    // criação entra no histórico como primeiro aporte, na mesma transação.
    const goal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financialGoal.create({
        data: {
          userId: req.user.userId,
          name: dto.name,
          targetCents: target.toString(),
          currentCents: initial.toString(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        },
      });
      if (initial !== 0n) {
        await tx.goalContribution.create({
          data: {
            goalId: created.id,
            amountCents: initial.toString(),
            note: 'Saldo inicial da meta',
          },
        });
      }
      return created;
    });
    return {
      ...goal,
      targetCents: centsToString(goal.targetCents),
      currentCents: centsToString(goal.currentCents),
    };
  }

  /**
   * Edita nome, alvo e vencimento. Mudar `currentCents` à mão continua
   * permitido, mas **entra no histórico** como aporte de ajuste: sem isso o
   * saldo da meta deixaria de ser explicado pela soma dos aportes.
   */
  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto
  ) {
    if (dto.targetCents !== undefined && BigInt(dto.targetCents) <= 0n) {
      throw new BadRequestException('O valor alvo da meta deve ser maior que zero.');
    }

    // Saldo da meta + aporte de ajuste numa transação só: antes o PATCH gravava
    // o novo saldo e, se a criação do aporte falhasse, o histórico deixava de
    // explicar o `currentCents` até alguém notar.
    const goal = await this.prisma.$transaction(async (tx) => {
      const current = await tx.financialGoal.findFirst({
        where: { id, userId: req.user.userId },
        select: { currentCents: true },
      });
      if (!current) {
        throw new NotFoundException('Meta não encontrada');
      }

      const updated = await tx.financialGoal.updateMany({
        where: { id, userId: req.user.userId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.targetCents !== undefined && { targetCents: dto.targetCents }),
          ...(dto.currentCents !== undefined && {
            currentCents: dto.currentCents,
          }),
          // `null` remove o prazo; `new Date(null)` gravaria 1970.
          ...(dto.dueDate !== undefined && {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          }),
        },
      });
      if (updated.count === 0) {
        throw new NotFoundException('Meta não encontrada');
      }

      if (dto.currentCents !== undefined) {
        const delta = BigInt(dto.currentCents) - BigInt(centsToString(current.currentCents));
        if (delta !== 0n) {
          await tx.goalContribution.create({
            data: {
              goalId: id,
              amountCents: delta.toString(),
              note: 'Ajuste manual do saldo',
            },
          });
        }
      }
      return tx.financialGoal.findUnique({ where: { id } });
    });
    if (!goal) {
      throw new NotFoundException('Meta não encontrada');
    }
    return {
      ...goal,
      targetCents: centsToString(goal.targetCents),
      currentCents: centsToString(goal.currentCents),
    };
  }

  /** Só o dono da meta acessa (evita 200 com id de outra pessoa). */
  private async assertOwned(userId: string, id: string): Promise<void> {
    const goal = await this.prisma.financialGoal.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!goal) throw new NotFoundException('Meta não encontrada');
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const deleted = await this.prisma.financialGoal.deleteMany({
      where: { id, userId: req.user.userId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Meta não encontrada');
    }
    return { id };
  }
}
