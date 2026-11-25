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
import { CreateGoalDto, UpdateGoalDto } from './dto/goal.dto';

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
      progress:
        Number(goal.targetCents) > 0 ? Number(goal.currentCents) / Number(goal.targetCents) : 0,
    }));
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateGoalDto) {
    const goal = await this.prisma.financialGoal.create({
      data: {
        userId: req.user.userId,
        name: dto.name,
        targetCents: dto.targetCents,
        currentCents: dto.currentCents ?? '0',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
    return {
      ...goal,
      targetCents: centsToString(goal.targetCents),
      currentCents: centsToString(goal.currentCents),
    };
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto
  ) {
    const updated = await this.prisma.financialGoal.updateMany({
      where: { id, userId: req.user.userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.targetCents !== undefined && { targetCents: dto.targetCents }),
        ...(dto.currentCents !== undefined && {
          currentCents: dto.currentCents,
        }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Meta não encontrada');
    }
    const goal = await this.prisma.financialGoal.findUnique({ where: { id } });
    if (!goal) {
      throw new NotFoundException('Meta não encontrada');
    }
    return {
      ...goal,
      targetCents: centsToString(goal.targetCents),
      currentCents: centsToString(goal.currentCents),
    };
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
