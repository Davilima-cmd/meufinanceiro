import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('open-finance')
export class OpenFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
  ) {}

  @Get('connections')
  @UseGuards(AuthGuard('jwt'))
  async listConnections(@Req() req: AuthenticatedRequest) {
    return this.prisma.bankConnection.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        status: true,
        consentId: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        account: { select: { id: true, name: true } },
      },
    });
  }

  @Post('connections')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_CONNECT)
  async connect(
    @Req() req: AuthenticatedRequest,
    @Body()
    dto: { provider: string; providerAccountId: string; accountId: string },
  ) {
    return this.prisma.bankConnection.create({
      data: {
        userId: req.user.userId,
        provider: dto.provider,
        providerAccountId: dto.providerAccountId,
        accountId: dto.accountId,
        status: 'active',
      },
    });
  }

  @Patch('connections/:id/revoke')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_REVOKE)
  async revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.prisma.bankConnection.update({
      where: { id, userId: req.user.userId },
      data: { status: 'disconnected' },
    });
  }

  @Get('consents')
  @UseGuards(AuthGuard('jwt'))
  async listConsents(@Req() req: AuthenticatedRequest) {
    return this.prisma.consent.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('sync')
  @UseGuards(AuthGuard('jwt'))
  async syncNow(@Req() req: AuthenticatedRequest) {
    return this.syncService.reconcileUser(req.user.userId, {
      trigger: 'manual',
    });
  }

  @Post('reconcile')
  @UseGuards(AuthGuard('jwt'))
  async reconcile(@Req() req: AuthenticatedRequest) {
    return this.syncService.reconcileUser(req.user.userId, {
      trigger: 'manual',
    });
  }

  @Post('webhooks/:provider')
  async webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Req() _req: Request,
  ) {
    const eventId =
      typeof payload === 'object' && payload !== null &&
      'event_id' in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>)['event_id'])
        : crypto.randomUUID();
    // Idempotência: evento duplicado é ignorado silenciosamente.
    await this.prisma.webhookEvent.create({
      data: {
        provider,
        eventId,
        payload: payload as Prisma.JsonObject,
        processed: false,
      },
    }).catch(() => undefined);
    return { received: true };
  }
}
