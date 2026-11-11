import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogData {
  userId?: string | null;
  action: string;
  target?: string | null;
  metadata?: Prisma.InputJsonValue | null;
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
