import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NetWorthService } from './net-worth.service';
import { CreateNetWorthItemDto, UpdateNetWorthItemDto } from './dto/net-worth.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('net-worth')
@UseGuards(AuthGuard('jwt'))
export class NetWorthController {
  constructor(private readonly netWorth: NetWorthService) {}

  /** Patrimônio líquido: contas + bens − dívidas. */
  @Get()
  async summary(@Req() req: AuthenticatedRequest) {
    return this.netWorth.summary(req.user.userId);
  }

  @Post('items')
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateNetWorthItemDto) {
    return this.netWorth.create(req.user.userId, dto);
  }

  @Patch('items/:id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateNetWorthItemDto
  ) {
    return this.netWorth.update(req.user.userId, id, dto);
  }

  @Delete('items/:id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.netWorth.remove(req.user.userId, id);
  }
}
