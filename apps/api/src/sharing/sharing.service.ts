import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  accessFromShares,
  isShareLevel,
  SHARE_LEVELS,
  type ShareLevel,
} from '../common/account-access';

/**
 * Compartilhamento entre o casal.
 *
 * O modelo tem duas camadas:
 *
 * - **Parceria** (`partnerships`): quem é o parceiro de quem. Sem parceria
 *   aceita, não há como compartilhar nada — compartilhar é um ato entre duas
 *   pessoas que se conhecem, não um código aberto.
 * - **Nível por conta** (`account_shares`): o dono decide, conta a conta, se o
 *   parceiro vê o saldo (`BALANCE_ONLY`) ou também o histórico (`FULL`). Toda
 *   conta nasce privada; compartilhar é sempre reversível (`revokedAt`).
 *
 * Escrita nunca é delegada: conta compartilhada é somente leitura para quem
 * recebeu, em qualquer nível.
 */
@Injectable()
export class SharingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estado atual do casal: parceria aceita (ou pendente, para quem convidou),
   * parceiro e nível de cada conta do usuário.
   */
  async overview(userId: string) {
    const [asOwner, asPartner, shares, accounts] = await Promise.all([
      this.prisma.partnership.findFirst({ where: { userId } }),
      this.prisma.partnership.findFirst({ where: { partnerId: userId } }),
      this.prisma.accountShare.findMany({
        where: { userId, revokedAt: null },
        select: { accountId: true, sharedWithId: true, level: true },
      }),
      this.prisma.financialAccount.findMany({
        where: { userId },
        select: { id: true, name: true, balanceCents: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const partnership = asOwner ?? asPartner;
    const partnerId = partnership
      ? partnership.userId === userId
        ? partnership.partnerId
        : partnership.userId
      : null;
    const partner = partnerId ? await this.partnerSummary(partnerId) : null;

    return {
      partnership: partnership
        ? {
            id: partnership.id,
            status: partnership.status,
            invitedByMe: partnership.userId === userId,
            partnerId,
          }
        : null,
      partner,
      accounts: accounts.map(
        (account: { id: string; name: string; balanceCents: { toString(): string } }) => {
          const share = shares.find((row: { accountId: string }) => row.accountId === account.id);
          return {
            id: account.id,
            name: account.name,
            balanceCents: account.balanceCents.toString(),
            level: (share?.level ?? 'private') as ShareLevel,
          };
        }
      ),
      levels: SHARE_LEVELS,
    };
  }

  /**
   * Convida alguém pelo e-mail. A parceria nasce `pending` e só libera
   * compartilhamento depois de aceita pela outra pessoa.
   */
  async invite(userId: string, email: string) {
    const target = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, name: true, email: true },
    });
    if (!target) throw new NotFoundException('Nenhuma conta cadastrada com esse e-mail.');
    if (target.id === userId) {
      throw new BadRequestException('Você não pode convidar você mesmo.');
    }

    const existing =
      (await this.prisma.partnership.findFirst({ where: { userId, partnerId: target.id } })) ??
      (await this.prisma.partnership.findFirst({
        where: { userId: target.id, partnerId: userId },
      }));

    if (existing && existing.status === 'accepted') {
      throw new BadRequestException('Vocês já são parceiros.');
    }

    const partnership = existing
      ? await this.prisma.partnership.update({
          where: { id: existing.id },
          // Reconvite sempre recoloca o pedido na mão de quem foi convidado.
          data: { userId, partnerId: target.id, status: 'pending' },
        })
      : await this.prisma.partnership.create({
          data: { userId, partnerId: target.id, status: 'pending' },
        });

    return { ...partnership, partner: { id: target.id, name: target.name, email: target.email } };
  }

  /** Aceita o convite. Só quem foi convidado pode aceitar. */
  async accept(userId: string) {
    const pending = await this.prisma.partnership.findFirst({
      where: { partnerId: userId, status: 'pending' },
    });
    if (!pending) throw new NotFoundException('Nenhum convite pendente para você.');
    return this.prisma.partnership.update({
      where: { id: pending.id },
      data: { status: 'accepted' },
    });
  }

  /**
   * Desfaz a parceria e revoga todos os compartilhamentos dos dois lados: sem
   * vínculo, ninguém deve continuar enxergando conta do outro.
   */
  async revoke(userId: string) {
    const partnership =
      (await this.prisma.partnership.findFirst({ where: { userId } })) ??
      (await this.prisma.partnership.findFirst({ where: { partnerId: userId } }));
    if (!partnership) throw new NotFoundException('Você não tem parceria ativa.');

    const now = new Date();
    // Sequencial (e não em lote) para o rollback cobrir os dois passos juntos.
    await this.prisma.$transaction(async (tx) => {
      await tx.partnership.update({ where: { id: partnership.id }, data: { status: 'revoked' } });
      await tx.accountShare.updateMany({
        where: {
          revokedAt: null,
          OR: [{ userId: partnership.userId }, { userId: partnership.partnerId }],
        },
        data: { revokedAt: now },
      });
    });

    return { revoked: true };
  }

  /**
   * Define o nível de uma conta do usuário. Só o dono muda o nível da própria
   * conta: o `userId` do filtro garante isso (conta de outro usuário não é
   * encontrada, e a resposta é 404 — não 403, para não revelar existência).
   */
  async setLevel(userId: string, accountId: string, level: string) {
    if (!isShareLevel(level)) {
      throw new BadRequestException('Nível de compartilhamento inválido.');
    }

    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
    if (level === 'private') return this.revokeShare(userId, accountId);

    const partnerId = await this.acceptedPartnerId(userId);
    if (!partnerId) {
      throw new BadRequestException(
        'Aceite uma parceria antes de compartilhar contas: compartilhar exige duas pessoas conectadas.'
      );
    }

    return this.prisma.accountShare.upsert({
      where: { accountId_sharedWithId: { accountId, sharedWithId: partnerId } },
      create: {
        accountId,
        userId,
        sharedWithId: partnerId,
        level,
        revokedAt: null,
      },
      // Reativar um compartilhamento revogado é só limpar `revokedAt`.
      update: { level, revokedAt: null },
    });
  }

  /** Contas que o parceiro compartilhou com o usuário, com o nível de cada uma. */
  async visibleAccounts(userId: string) {
    const rows = await this.prisma.accountShare.findMany({
      where: { sharedWithId: userId, revokedAt: null, level: { in: ['FULL', 'BALANCE_ONLY'] } },
      select: {
        level: true,
        account: {
          select: { id: true, name: true, institution: true, balanceCents: true, isActive: true },
        },
        owner: { select: { id: true, name: true } },
      },
    });

    return rows.map(
      (row: {
        level: string;
        owner: { id: string; name: string };
        account: {
          id: string;
          name: string;
          institution: string | null;
          balanceCents: { toString(): string };
          isActive: boolean;
        };
      }) => ({
        account: {
          ...row.account,
          balanceCents: row.account.balanceCents.toString(),
        },
        owner: row.owner,
        ...accessFromShares([{ sharedWithId: userId, level: row.level }]),
        level: row.level,
      })
    );
  }

  private async revokeShare(userId: string, accountId: string) {
    await this.prisma.accountShare.updateMany({
      where: { accountId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { accountId, level: 'private' as const, revoked: true };
  }

  private async acceptedPartnerId(userId: string): Promise<string | null> {
    const partnership =
      (await this.prisma.partnership.findFirst({
        where: { userId, status: 'accepted' },
        select: { partnerId: true },
      })) ??
      (await this.prisma.partnership.findFirst({
        where: { partnerId: userId, status: 'accepted' },
        select: { userId: true },
      }));
    if (!partnership) return null;
    return 'partnerId' in partnership ? partnership.partnerId : partnership.userId;
  }

  private async partnerSummary(userId: string) {
    const partner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!partner) return null;
    // O e-mail do parceiro fica de fora: já é conhecido de quem convidou.
    return { id: partner.id, name: partner.name };
  }
}
