import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JsonValue } from '../common/json';

export interface AuditLogData {
  userId?: string | null;
  action: string;
  target?: string | null;
  metadata?: JsonValue | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: AuditLogData): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        action: data.action,
        target: data.target ?? null,
        ...(data.metadata !== undefined && data.metadata !== null
          ? { metadata: data.metadata }
          : {}),
      },
    });
  }
}
