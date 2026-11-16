import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('financial-goals')
@UseGuards(AuthGuard('jwt'))
export class FinancialGoalsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const goals = await this.prisma.financialGoal.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    return goals.map((goal) => ({
      ...goal,
      targetCents: goal.targetCents.toString(),
      currentCents: goal.currentCents.toString(),
      progress:
        Number(goal.targetCents) > 0 ? Number(goal.currentCents) / Number(goal.targetCents) : 0,
    }));
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    dto: {
      name: string;
      targetCents: string;
      currentCents?: string;
      dueDate?: string;
    }
  ) {
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
      targetCents: goal.targetCents.toString(),
      currentCents: goal.currentCents.toString(),
    };
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      targetCents?: string;
      currentCents?: string;
      dueDate?: string;
    }
  ) {
    const goal = await this.prisma.financialGoal.update({
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
    return {
      ...goal,
      targetCents: goal.targetCents.toString(),
      currentCents: goal.currentCents.toString(),
    };
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.prisma.financialGoal.delete({
      where: { id, userId: req.user.userId },
    });
    return { id };
  }
}
