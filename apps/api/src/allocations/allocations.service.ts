import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { centsToString, type DecimalLike } from '../common/money';
import { splitAmount, type SplitMode } from './split';

/**
 * Rateio de um lançamento entre as duas pessoas do casal.
 *
 * Regras (itens 21.5/21.6 da especificação):
 *
 * - o rateio pertence ao **dono do lançamento**: só ele cria, altera e liquida;
 * - a soma das partes é exatamente o valor do lançamento (ver `split.ts`);
 * - o rateio pode incluir só o próprio dono (ex.: despesa 100% dele) ou incluir
 *   o parceiro, que é quem passa a dever a parte;
 * - refazer o rateio substitui as partes: histórico é o do lançamento, não uma
 *   pilha de versões antigas.
 */
@Injectable()
export class AllocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria (ou refaz) o rateio de um lançamento. */
  async upsert(
    userId: string,
    transactionId: string,
    input: { participants: string[]; mode?: SplitMode; weights?: Record<string, number> }
  ) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId, deletedAt: null },
      select: { id: true, amountCents: true },
    });
    if (!transaction) throw new NotFoundException('Lançamento não encontrado');

    await this.assertParticipants(userId, input.participants);

    const amount = BigInt(centsToString(transaction.amountCents as DecimalLike));
    let parts;
    try {
      parts = splitAmount({
        amountCents: amount,
        participantIds: input.participants,
        mode: input.mode,
        weights: input.weights,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Rateio inválido.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.allocation.deleteMany({ where: { transactionId } });
      await tx.allocation.createMany({
        data: parts.map((part) => ({
          transactionId,
          userId: part.userId,
          shareCents: part.shareCents.toString(),
          mode: input.mode ?? 'equal',
          // `percentBasis` guarda o peso usado (70, 33.33…), para o histórico
          // mostrar como a divisão foi feita.
          percentBasis: input.weights?.[part.userId] ?? null,
        })),
      });
    });

    return this.list(userId, transactionId);
  }

  /** Partes do rateio, com o nome de cada participante. */
  async list(userId: string, transactionId: string) {
    const visibility = await this.assertVisible(userId, transactionId);
    const rows = await this.prisma.allocation.findMany({
      where: { transactionId },
      select: {
        id: true,
        userId: true,
        shareCents: true,
        mode: true,
        percentBasis: true,
        settledAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(
      (row: {
        id: string;
        userId: string;
        shareCents: DecimalLike;
        mode: string;
        percentBasis: number | null;
        settledAt: Date | null;
        user: { name: string };
      }) => ({
        id: row.id,
        userId: row.userId,
        name: row.user.name,
        shareCents: centsToString(row.shareCents),
        mode: row.mode,
        percentBasis: row.percentBasis,
        settledAt: row.settledAt,
        /**
         * Quem pode marcar esta parte como acertada.
         *
         * Antes a tela liberava o botão para todo mundo e o servidor aceitava:
         * o **devedor** marcava a própria dívida como paga e um lado via a
         * conta zerada enquanto o outro continuava esperando o dinheiro.
         * Acertar é ato de quem recebe: só o dono do lançamento, e nunca a
         * própria parte dele.
         */
        canSettle: visibility.ownerId === userId && row.userId !== visibility.ownerId,
      })
    );
  }

  /**
   * Quanto cada pessoa deve no período. É o número que a tela do casal mostra:
   * "nesta competência, você deve R$ X e Ana deve R$ Y".
   */
  async summary(userId: string, from: Date, to: Date) {
    const transactionIds = await this.transactionIdsInPeriod(userId, from, to);
    if (transactionIds.length === 0) return { from, to, parts: [] };

    const rows = await this.prisma.allocation.findMany({
      where: { transactionId: { in: transactionIds } },
      select: {
        userId: true,
        shareCents: true,
        settledAt: true,
        user: { select: { name: true } },
      },
    });

    const byUser = new Map<string, { name: string; totalCents: bigint; settledCents: bigint }>();
    for (const row of rows as Array<{
      userId: string;
      shareCents: DecimalLike;
      settledAt: Date | null;
      user: { name: string };
    }>) {
      const current = byUser.get(row.userId) ?? {
        name: row.user.name,
        totalCents: 0n,
        settledCents: 0n,
      };
      const value = BigInt(centsToString(row.shareCents));
      current.totalCents += value;
      if (row.settledAt) current.settledCents += value;
      byUser.set(row.userId, current);
    }

    return {
      from,
      to,
      parts: [...byUser.entries()].map(([id, value]) => ({
        userId: id,
        name: value.name,
        totalCents: value.totalCents.toString(),
        settledCents: value.settledCents.toString(),
        openCents: (value.totalCents - value.settledCents).toString(),
      })),
    };
  }

  /**
   * Marca a parte de alguém como acertada (pagamento parcial ou total).
   *
   * Só o dono do lançamento (o credor) acerta — e nunca a própria parte: quem
   * deve é quem paga, e a confirmação é de quem recebeu. `participantId` tem de
   * ser de fato participante do rateio, senão o `updateMany` virava um "acertar
   * qualquer coisa" silencioso (ou 404 confuso).
   */
  async settle(userId: string, transactionId: string, participantId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!transaction) throw new NotFoundException('Lançamento não encontrado');
    if (participantId === userId) {
      throw new BadRequestException(
        'A própria parte não pode ser marcada como acertada — quem confirma o acerto é quem recebe.'
      );
    }

    const result = await this.prisma.allocation.updateMany({
      where: { transactionId, userId: participantId, settledAt: null },
      data: { settledAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Parte do rateio não encontrada');
    return this.list(userId, transactionId);
  }

  /** Lançamentos do usuário (próprios) no período, com rateio. */
  private async transactionIdsInPeriod(userId: string, from: Date, to: Date): Promise<string[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        competenceDate: { gte: from, lte: to },
        allocations: { some: {} },
      },
      select: { id: true },
    });
    return rows.map((row: { id: string }) => row.id);
  }

  /**
   * O lançamento precisa ser visível para quem consulta o rateio.
   *
   * Devolve o dono do lançamento — a tela usa isso para não oferecer um botão
   * de acerto que o servidor vai recusar.
   */
  private async assertVisible(userId: string, transactionId: string): Promise<{ ownerId: string }> {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, deletedAt: null },
      select: {
        userId: true,
        account: {
          select: { shares: { select: { sharedWithId: true, level: true, revokedAt: true } } },
        },
      },
    });
    if (!transaction) throw new NotFoundException('Lançamento não encontrado');
    if (transaction.userId === userId) return { ownerId: transaction.userId };

    const shared = transaction.account.shares.some(
      (share: { sharedWithId: string; level: string; revokedAt: Date | null }) =>
        share.sharedWithId === userId && !share.revokedAt && share.level === 'FULL'
    );
    if (!shared) throw new NotFoundException('Lançamento não encontrado');
    return { ownerId: transaction.userId };
  }

  /** Só o dono e o parceiro dele podem ser participantes do rateio. */
  private async assertParticipants(userId: string, participants: string[]): Promise<void> {
    const allowed = new Set([userId]);
    const partnership =
      (await this.prisma.partnership.findFirst({
        where: { userId, status: 'accepted' },
        select: { partnerId: true },
      })) ??
      (await this.prisma.partnership.findFirst({
        where: { partnerId: userId, status: 'accepted' },
        select: { userId: true },
      }));
    if (partnership) {
      allowed.add('partnerId' in partnership ? partnership.partnerId : partnership.userId);
    }

    for (const participant of participants) {
      if (!allowed.has(participant)) {
        throw new BadRequestException(
          'O rateio só pode envolver você e seu parceiro com parceria aceita.'
        );
      }
    }
  }
}
