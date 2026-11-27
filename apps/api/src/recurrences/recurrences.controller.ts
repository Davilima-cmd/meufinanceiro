import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecurrencesService } from './recurrences.service';
import { CreateRecurrenceDto, SetRecurrenceActiveDto } from './dto/recurrence.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('recurrences')
@UseGuards(AuthGuard('jwt'))
export class RecurrencesController {
  constructor(private readonly recurrences: RecurrencesService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return this.recurrences.list(req.user.userId);
  }

  @Post()
  @AuditLog(AuditAction.RECURRENCE_CREATE)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateRecurrenceDto) {
    return this.recurrences.create(req.user.userId, dto);
  }

  @Patch(':id')
  async setActive(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetRecurrenceActiveDto
  ) {
    return this.recurrences.setActive(req.user.userId, id, dto.active);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.recurrences.remove(req.user.userId, id);
  }

  /** Gera os lançamentos vencidos agora (idempotente). */
  @HttpCode(HttpStatus.OK)
  @Post('run')
  async run(@Req() req: AuthenticatedRequest) {
    return this.recurrences.run(req.user.userId);
  }
}
