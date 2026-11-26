import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BankProviderAdapter, ProviderTransaction } from './provider.adapter';

const DEFAULT_RATE_LIMIT_MINUTES = 5;
const DAILY_HOURS = 24;

interface SyncResult {
  connections: number;
  transactions: number;
}

interface ProviderIdRow {
  providerId: string | null;
}

interface IdRow {
  id: string;
}

/**
 * Reconciliação diária e sob demanda.
 *
 * - Compara o que o provedor informa com o que está salvo e corrige lacunas:
 *   cria transações ausentes, atualiza campos do provedor (valor, data, tipo,
 *   descrição) e recomputa o saldo da conta a partir dos lançamentos.
 * - Idempotente: usa o identificador original do provedor (`providerId`),
 *   que é único no banco, então reexecutar não duplica lançamentos.
 * - Registra o resultado (sucesso/falha) em `sync_jobs`.
 * - O botão "Sincronizar agora" é limitado por frequência; a varredura diária
 *   não está sujeita ao limite.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: BankProviderAdapter
  ) {}

  private rateLimitMinutes(): number {
    const value = Number(process.env.SYNC_RATE_LIMIT_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_RATE_LIMIT_MINUTES;
  }

  /**
   * Executa a reconciliação para um usuário. `trigger` distingue o botão
   * sob demanda (sujeito a limite de frequência) da varredura diária.
   */
  async reconcileUser(userId: string, options: { trigger: 'manual' | 'daily' }) {
    if (options.trigger === 'manual') {
      await this.enforceRateLimit(userId);
    }

    const job = await this.prisma.syncJob.create({
      data: { userId, status: 'pending' },
    });

    const startedAt = new Date();
    try {
      await this.reconcile(userId);
      const finishedAt = new Date();
      return this.prisma.syncJob.update({
        where: { id: job.id },
        data: { status: 'completed', startedAt, finishedAt },
      });
    } catch (error) {
      const finishedAt = new Date();
      return this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          finishedAt,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async reconcile(userId: string): Promise<SyncResult> {
    const connections = await this.prisma.bankConnection.findMany({
      where: { userId, status: 'active' },
    });

    let transactionsSynced = 0;
    for (const connection of connections) {
      const providerTransactions: ProviderTransaction[] = await this.adapter.fetchTransactions({
        provider: connection.provider,
        providerAccountId: this.prisma.decryptSensitive(connection.providerAccountId) ?? '',
      });

      if (providerTransactions.length === 0) continue;

      const providerIds = providerTransactions.map((tx) => tx.providerId);

      // Uma única consulta: quais lançamentos deste usuário já existem?
      // Evita um `upsert` por transação (N+1) dentro do loop de conexões.
      const existing: ProviderIdRow[] = await this.prisma.transaction.findMany({
        where: {
          providerId: { in: providerIds },
          userId,
        },
        select: { providerId: true },
      });
      const existingProviderIds = new Set(existing.map((tx) => tx.providerId));

      const toCreate = providerTransactions.filter((tx) => !existingProviderIds.has(tx.providerId));
      const toUpdate = providerTransactions.filter((tx) => existingProviderIds.has(tx.providerId));

      // Inserção em lote dos lançamentos novos.
      if (toCreate.length > 0) {
        await this.prisma.transaction.createMany({
          data: toCreate.map((tx) => ({
            accountId: connection.accountId,
            userId,
            providerId: tx.providerId,
            description: tx.description,
            amountCents: String(tx.amountCents),
            type: tx.type,
            origin: 'imported',
            date: tx.date,
          })),
          skipDuplicates: true,
        });
      }
      transactionsSynced += toCreate.length;

      // Atualização apenas dos lançamentos que já existem.
      for (const tx of toUpdate) {
        await this.prisma.transaction.update({
          where: { providerId: tx.providerId },
          data: {
            description: tx.description,
            amountCents: String(tx.amountCents),
            type: tx.type,
            date: tx.date,
          },
        });
        transactionsSynced++;
      }

      const balance = await this.prisma.transaction.aggregate({
        where: { accountId: connection.accountId },
        _sum: { amountCents: true },
      });
      await this.prisma.financialAccount.update({
        where: { id: connection.accountId },
        data: {
          balanceCents: balance._sum.amountCents ?? 0,
        },
      });
    }

    return { connections: connections.length, transactions: transactionsSynced };
  }

  private async enforceRateLimit(userId: string): Promise<void> {
    const windowMinutes = this.rateLimitMinutes();
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const last = await this.prisma.syncJob.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (last && last.status !== 'failed' && last.createdAt >= windowStart) {
      const retryAfter = Math.ceil(
        (last.createdAt.getTime() + windowMinutes * 60 * 1000 - Date.now()) / 1000
      );
      throw new HttpException(
        {
          message: `Sincronização muito frequente. Tente novamente em ${retryAfter}s.`,
          retryAfter: Math.max(retryAfter, 1),
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * Varredura diária: executa a reconciliação para usuários cuja última
   * sincronização foi concluída há mais de 24h (ou nunca foi executada).
   *
   * Busca o último job de todos os usuários em uma única consulta, evitando
   * o N+1 de um `findFirst` por usuário dentro do loop.
   */
  async runDailyReconciliation(): Promise<void> {
    const users: IdRow[] = await this.prisma.user.findMany({
      where: { bankConnections: { some: { status: 'active' } } },
    });
    if (users.length === 0) return;

    const cutoff = new Date(Date.now() - DAILY_HOURS * 60 * 60 * 1000);

    const jobs = await this.prisma.syncJob.findMany({
      where: { userId: { in: users.map((user) => user.id) } },
      orderBy: { createdAt: 'desc' },
    });
    const lastByUser = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) {
      if (!lastByUser.has(job.userId)) {
        lastByUser.set(job.userId, job);
      }
    }

    for (const user of users) {
      const last = lastByUser.get(user.id);
      if (last?.finishedAt && last.finishedAt >= cutoff) continue;

      try {
        await this.reconcileUser(user.id, { trigger: 'daily' });
      } catch (error) {
        this.logger.error(`Reconciliação diária falhou para o usuário ${user.id}`, error);
      }
    }
  }
}
