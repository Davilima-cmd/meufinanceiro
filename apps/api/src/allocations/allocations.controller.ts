import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AllocationsService } from './allocations.service';
import { SettleAllocationDto, UpsertAllocationDto } from './dto/allocation.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('allocations')
@UseGuards(AuthGuard('jwt'))
export class AllocationsController {
  constructor(private readonly allocations: AllocationsService) {}

  /** Rateio de um lançamento. */
  @Get('transactions/:id')
  async list(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.allocations.list(req.user.userId, id);
  }

  /** Cria/refaz o rateio. Só o dono do lançamento. */
  @Put('transactions/:id')
  @AuditLog(AuditAction.ALLOCATION_UPSERT)
  async upsert(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpsertAllocationDto
  ) {
    return this.allocations.upsert(req.user.userId, id, {
      participants: dto.participants,
      mode: dto.mode,
      weights: dto.weights,
    });
  }

  /** Marca a parte de um participante como acertada. */
  @Post('transactions/:id/settle')
  @AuditLog(AuditAction.ALLOCATION_SETTLE)
  async settle(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SettleAllocationDto
  ) {
    return this.allocations.settle(req.user.userId, id, dto.participantId);
  }

  /** Quanto cada pessoa deve no período (`?from=YYYY-MM-DD&to=YYYY-MM-DD`). */
  @Get('summary')
  async summary(
    @Req() req: AuthenticatedRequest,
    @Query('from') from: string,
    @Query('to') to: string
  ) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to
      ? new Date(to)
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    return this.allocations.summary(req.user.userId, fromDate, toDate);
  }
}
