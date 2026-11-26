import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';
import { OPEN_FINANCE_PROVIDER, OpenFinanceProvider } from './open-finance.provider';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

class LinkAccountDto {
  /** Provedor da instituição (`sandbox`, `pluggy`, …). */
  @IsString()
  @Length(1, 64)
  provider: string;

  /** Id da conta **no provedor**, descoberto em `GET /open-finance/available-accounts`. */
  @IsString()
  @Length(1, 255)
  providerAccountId: string;

  /** Nível inicial de compartilhamento. Importado começa privado. */
  @IsOptional()
  @IsIn(['private', 'BALANCE_ONLY', 'FULL'])
  shareLevel?: 'private' | 'BALANCE_ONLY' | 'FULL';
}

/**
 * Vínculo de conta bancária via Open Finance.
 *
 * Regra de produto: conta de banco **não é digitada dentro do app**. O usuário
 * autoriza a instituição e o app cria a conta a partir do que o provedor
 * informa — nome, instituição, tipo e saldo vêm de lá, e o histórico é
 * importado pela reconciliação. Criar "conta corrente do Nubank" na mão é
 * aceito apenas como conta manual (`POST /accounts`), que é o que ela é.
 *
 * Por que um endpoint próprio em vez de deixar o front chamar
 * `POST /accounts` + `POST /open-finance/connections`: aquilo permitia vincular
 * uma conta manual já existente a qualquer `providerAccountId` inventado pelo
 * cliente, sem nunca consultar o provedor. Aqui o `providerAccountId` é
 * validado contra a lista real da instituição antes de qualquer escrita.
 */
@Controller('open-finance')
@UseGuards(AuthGuard('jwt'))
export class OpenFinanceAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
    @Inject(OPEN_FINANCE_PROVIDER)
    private readonly provider: OpenFinanceProvider
  ) {}

  /**
   * Contas disponíveis na instituição para vincular.
   *
   * Enquanto o provedor real não está integrado, em produção não há o que
   * listar: respondemos `provider: "nenhum"` com lista vazia, e a interface
   * explica que o vínculo automático ainda não está liberado — em vez de
   * oferecer uma tela que sempre falha.
   */
  @Get('available-accounts')
  async availableAccounts() {
    const live = this.providerLive();
    if (!live) {
      return {
        provider: 'nenhum' as const,
        available: false,
        accounts: [],
        reason:
          'A integração automática com bancos ainda não está liberada neste ambiente. ' +
          'Você pode criar uma conta manual e vincular a instituição depois.',
      };
    }

    const accounts = await this.provider.listAccounts();
    // Uma conta já vinculada não deve aparecer de novo na lista.
    const linked = await this.prisma.bankConnection.findMany({
      where: { providerAccountId: { in: accounts.map((account) => account.id) } },
      select: { providerAccountId: true },
    });
    const linkedIds = new Set(
      linked.map((row: { providerAccountId: string }) => row.providerAccountId)
    );

    return {
      provider: this.provider.kind,
      available: true,
      accounts: accounts.map((account) => ({
        providerAccountId: account.id,
        name: account.name,
        institution: account.institution ?? null,
        type: account.type,
        currency: account.currency,
        balanceCents: account.balanceCents,
        alreadyLinked: linkedIds.has(account.id),
      })),
    };
  }

  /**
   * Cria a conta a partir do provedor e a deixa vinculada.
   *
   * Tudo numa transação: se a conexão falhar, a conta não fica órfã (uma conta
   * sem vínculo e sem histórico confunde mais do que ajuda).
   */
  @Post('link-account')
  @AuditLog(AuditAction.ACCOUNT_CONNECT)
  async linkAccount(@Req() req: AuthenticatedRequest, @Body() dto: LinkAccountDto) {
    if (!this.providerLive()) {
      throw new BadRequestException(
        'O vínculo automático com bancos ainda não está liberado. Use uma conta manual por enquanto.'
      );
    }

    const available = await this.provider.listAccounts();
    const remote = available.find((account) => account.id === dto.providerAccountId);
    if (!remote) {
      // 404 e não 400: o id informado não existe na instituição.
      throw new NotFoundException('Conta não encontrada na instituição escolhida');
    }

    const already = await this.prisma.bankConnection.findFirst({
      where: { provider: dto.provider, providerAccountId: dto.providerAccountId },
      select: { id: true, userId: true },
    });
    if (already) {
      throw new ConflictException(
        already.userId === req.user.userId
          ? 'Esta conta já está vinculada à sua conta no app.'
          : 'Esta conta bancária já está vinculada a outro usuário.'
      );
    }

    const consent = await this.provider.createConsent(req.user.userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.financialAccount.create({
        data: {
          userId: req.user.userId,
          name: remote.name,
          institution: remote.institution ?? null,
          type: remote.type,
          currency: remote.currency,
          // O saldo inicial é o do provedor; a reconciliação passa a mantê-lo
          // atualizado a partir do histórico importado.
          balanceCents: remote.balanceCents,
        },
        select: { id: true, name: true },
      });

      const consentRow = await tx.consent.create({
        data: {
          userId: req.user.userId,
          provider: dto.provider,
          externalId: consent.externalId,
          status: consent.status,
          expiresAt: consent.expiresAt,
        },
      });

      const connection = await tx.bankConnection.create({
        data: {
          userId: req.user.userId,
          accountId: account.id,
          provider: dto.provider,
          providerAccountId: dto.providerAccountId,
          status: 'active',
          consentId: consentRow.id,
          expiresAt: consent.expiresAt,
        },
        select: { id: true },
      });

      return { account, connection };
    });

    // Importa o histórico imediatamente: a conta recém-criada sem lançamentos
    // parece vazia, e o usuário conclui (errado) que o vínculo não funcionou.
    // A falha na sincronização não desfaz o vínculo — o job fica registrado e a
    // próxima varredura tenta de novo.
    const sync = await this.syncService
      .reconcileUser(req.user.userId, { trigger: 'daily' })
      .catch(() => null);

    return {
      account: result.account,
      connectionId: result.connection.id,
      synced: Boolean(sync),
    };
  }

  /** O provedor disponível é real (não sandbox) ou estamos fora de produção. */
  private providerLive(): boolean {
    if (this.provider.kind === 'live') return true;
    return process.env.NODE_ENV !== 'production';
  }
}
