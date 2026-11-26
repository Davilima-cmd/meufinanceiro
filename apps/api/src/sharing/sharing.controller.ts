import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SharingService } from './sharing.service';
import { AcceptPartnershipDto, InvitePartnerDto, SetShareLevelDto } from './dto/sharing.dto';
import { AuditAction, AuditLog } from '../audit/audit-log.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('sharing')
@UseGuards(AuthGuard('jwt'))
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  /** Parceria, parceiro e nível de cada conta do usuário. */
  @Get()
  async overview(@Req() req: AuthenticatedRequest) {
    return this.sharing.overview(req.user.userId);
  }

  /** Contas que o parceiro compartilhou com você (saldo e/ou histórico). */
  @Get('accounts')
  async sharedAccounts(@Req() req: AuthenticatedRequest) {
    return this.sharing.visibleAccounts(req.user.userId);
  }

  @Post('invite')
  @AuditLog(AuditAction.PARTNERSHIP_INVITE)
  async invite(@Req() req: AuthenticatedRequest, @Body() dto: InvitePartnerDto) {
    return this.sharing.invite(req.user.userId, dto.email);
  }

  @Post('accept')
  @AuditLog(AuditAction.PARTNERSHIP_ACCEPT)
  async accept(@Req() req: AuthenticatedRequest, @Body() dto: AcceptPartnershipDto) {
    return this.sharing.accept(req.user.userId, dto.partnershipId);
  }

  @Delete()
  @AuditLog(AuditAction.PARTNERSHIP_REVOKE)
  async revoke(@Req() req: AuthenticatedRequest) {
    return this.sharing.revoke(req.user.userId);
  }

  /** Define (ou revoga, com `private`) o nível de uma conta do usuário. */
  @Patch('accounts/:id')
  @AuditLog(AuditAction.ACCOUNT_SHARE_UPDATE)
  async setLevel(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetShareLevelDto
  ) {
    return this.sharing.setLevel(req.user.userId, id, dto.level);
  }
}
