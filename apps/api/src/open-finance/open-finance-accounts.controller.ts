import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
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
import { PluggyOpenFinanceProvider } from './pluggy.provider';
import { isUniqueViolation } from '../common/prisma-errors';

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

/** Item devolvido pelo widget de consentimento do provedor. */
class ConnectItemDto {
  /** `itemId`/`id` reportado pelo widget (`onSuccess`). */
  @IsString()
  @Length(1, 255)
  itemId: string;
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
    // `null` em produção sem credenciais do provedor: o ambiente não tem
    // sandbox nem provedor real, e todas as rotas respondem erro de
    // configuração em vez de inventar dados bancários.
    @Optional()
    @Inject(OPEN_FINANCE_PROVIDER)
    private readonly provider: OpenFinanceProvider | null
  ) {}

  /**
   * Token de curta duração para o widget de consentimento do provedor.
   *
   * O `clientSecret` do provedor nunca sai do servidor: a web recebe só este
   * token (30 min, escopo restrito) e abre o widget. É o caminho que o Open
   * Finance exige — o consentimento é dado pelo usuário dentro do app do banco.
   */
  @Post('connect-token')
  async connectToken(@Req() req: AuthenticatedRequest) {
    const pluggy = this.asPluggy();
    if (!pluggy) {
      throw new BadRequestException(
        'Conexão bancária real não está configurada. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.'
      );
    }
    const webhookUrl = process.env.OPEN_FINANCE_WEBHOOK_URL?.trim() || undefined;
    const { accessToken } = await pluggy.connectToken(req.user.userId, webhookUrl);
    return {
      provider: 'pluggy',
      accessToken,
      // A web carrega o widget deste CDN; expor a URL evita hardcode duplicado.
      widgetUrl:
        process.env.PLUGGY_CONNECT_URL ??
        'https://cdn.pluggy.ai/pluggy-connect/v2.8.0/pluggy-connect.js',
    };
  }

  /**
   * Registra o item criado pelo widget e importa as contas dele.
   *
   * O widget devolve o `itemId`; a partir daí as contas são lidas pela API do
   * provedor (com as nossas credenciais) e vinculadas ao usuário. Nenhum dado
   * vem do corpo da requisição além do id — o resto é conferido no provedor.
   */
  @Post('connect-item')
  @AuditLog(AuditAction.ACCOUNT_CONNECT)
  async connectItem(@Req() req: AuthenticatedRequest, @Body() dto: ConnectItemDto) {
    const pluggy = this.asPluggy();
    if (!pluggy) {
      throw new BadRequestException(
        'Conexão bancária real não está configurada. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.'
      );
    }

    const item = await pluggy.itemStatus(dto.itemId).catch(() => null);
    if (!item) {
      throw new NotFoundException('Item não encontrado no provedor');
    }
    /**
     * Titularidade do item (IDOR).
     *
     * O `itemId` vem do navegador. Sem esta checagem, quem descobrisse o id de
     * outra pessoa chamaria `connect-item` e importaria as contas dela para a
     * própria conta no app. O provedor guarda o `clientUserId` que enviamos no
     * token — é ele que prova de quem é o item.
     */
    if (item.clientUserId && item.clientUserId !== req.user.userId) {
      // 404 e não 403: confirmar a existência do item já é informação demais.
      throw new NotFoundException('Item não encontrado no provedor');
    }

    if (item.status === 'LOGIN_ERROR' || item.status === 'OUTDATED') {
      throw new BadRequestException(
        'O banco recusou a conexão. Refaça o consentimento informando as credenciais novamente.'
      );
    }

    // O item é a fonte da verdade: as contas vêm dele, não do corpo da requisição.
    // A lista vem do item recém-criado (ainda sem vínculo gravado), não dos
    // itens já conectados: é justamente o primeiro vínculo que está nascendo.
    const accounts = await pluggy.listAccounts(req.user.userId, dto.itemId);
    if (accounts.length === 0) {
      throw new BadRequestException(
        'O banco ainda está processando a autorização. Tente novamente em alguns instantes.'
      );
    }

    /**
     * Idempotência: se **todas** as contas do item já estão vinculadas, este
     * `connect-item` é uma repetição (duplo clique, retry do widget, recarregar
     * a página no meio). Antes, o fluxo criava um novo consentimento e nunca o
     * usava — cada repetição deixava um consentimento órfão no banco, dizendo
     * que havia autorização para um item que já estava conectado.
     */
    const alreadyLinked = await this.prisma.bankConnection.count({
      where: {
        provider: 'pluggy',
        providerAccountId: { in: accounts.map((account) => account.id) },
      },
    });
    if (alreadyLinked === accounts.length) {
      return {
        itemId: dto.itemId,
        status: item.status,
        accounts: accounts.length,
        created: 0,
        skipped: accounts.length,
        synced: false,
      };
    }

    const consent = await pluggy.createConsent(req.user.userId, dto.itemId);

    let created = 0;
    let skipped = 0;
    // O consentimento só é gravado se alguma conta nascer de fato: sem isso,
    // uma corrida entre duas requisições deixava um consentimento sem conta.
    let consentRowId: string | null = null;

    for (const account of accounts) {
      // `create` com a conexão na mesma transação e a unique de
      // `providerAccountId` como rede: duas requisições concorrentes não criam
      // duas contas para a mesma conta bancária.
      const result = await this.prisma
        .$transaction(async (tx) => {
          const existing = await tx.bankConnection.findFirst({
            where: { provider: 'pluggy', providerAccountId: account.id },
            select: { id: true, userId: true },
          });
          if (existing) return { skipped: true as const, created: false as const };

          const row = await tx.financialAccount.create({
            data: {
              userId: req.user.userId,
              name: account.name,
              institution: account.institution ?? null,
              type: account.type,
              currency: account.currency,
              balanceCents: account.balanceCents,
            },
            select: { id: true },
          });

          let consentId = consentRowId;
          if (!consentId) {
            const consentRow = await tx.consent.create({
              data: {
                userId: req.user.userId,
                provider: 'pluggy',
                externalId: consent.externalId,
                status: consent.status,
                expiresAt: consent.expiresAt,
              },
              select: { id: true },
            });
            consentId = consentRow.id;
            consentRowId = consentId;
          }

          await tx.bankConnection.create({
            data: {
              userId: req.user.userId,
              accountId: row.id,
              provider: 'pluggy',
              providerAccountId: account.id,
              providerItemId: dto.itemId,
              status: 'active',
              consentId,
              expiresAt: consent.expiresAt,
            },
          });
          return { skipped: false as const, created: true as const };
        })
        .catch((error: unknown) => {
          // Unique violação = outra requisição vinculou a mesma conta primeiro.
          if (isUniqueViolation(error)) return { skipped: true as const, created: false as const };
          throw error;
        });

      if (result.skipped) skipped += 1;
      if (result.created) created += 1;
    }

    // Importa o histórico agora: conta sem lançamentos parece vazia, e o usuário
    // conclui (errado) que a conexão não funcionou. Falha de sync não desfaz o
    // vínculo — a próxima varredura tenta de novo.
    const sync =
      created > 0
        ? await this.syncService
            .reconcileUser(req.user.userId, { trigger: 'daily' })
            .catch(() => null)
        : null;

    return {
      itemId: dto.itemId,
      status: item.status,
      accounts: accounts.length,
      created,
      skipped,
      synced: Boolean(sync),
    };
  }

  /**
   * Contas disponíveis na instituição para vincular.
   *
   * Enquanto o provedor real não está integrado, em produção não há o que
   * listar: respondemos `provider: "nenhum"` com lista vazia, e a interface
   * explica que o vínculo automático ainda não está liberado — em vez de
   * oferecer uma tela que sempre falha.
   */
  @Get('available-accounts')
  async availableAccounts(@Req() req: AuthenticatedRequest) {
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

    const accounts = await this.provider!.listAccounts(req.user.userId);
    // Uma conta já vinculada não deve aparecer de novo na lista.
    const linked = await this.prisma.bankConnection.findMany({
      where: { providerAccountId: { in: accounts.map((account) => account.id) } },
      select: { providerAccountId: true },
    });
    const linkedIds = new Set(
      linked.map((row: { providerAccountId: string }) => row.providerAccountId)
    );

    return {
      provider: this.provider!.kind,
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

    const available = await this.provider!.listAccounts(req.user.userId);
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

    const consent = await this.provider!.createConsent(req.user.userId);

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

  /**
   * O provedor disponível é real, ou o sandbox foi liberado explicitamente.
   *
   * O sandbox devolve saldos e lançamentos **fictícios** (R$ 5.432,10 etc.). Em
   * produção ele fica bloqueado por padrão: criar conta real com dinheiro
   * inventado é pior do que não ter integração. Para testar o fluxo ponta a
   * ponta antes de contratar um provedor, basta definir
   * `OPEN_FINANCE_SANDBOX_IN_PRODUCTION=true` — e as contas criadas assim ficam
   * marcadas com o provedor `sandbox`, fáceis de identificar e remover.
   */
  /** O provider só é Pluggy quando as credenciais estão configuradas. */
  private asPluggy(): PluggyOpenFinanceProvider | null {
    if (!this.provider) return null;
    const candidate = this.provider as Partial<PluggyOpenFinanceProvider>;
    return typeof candidate.connectToken === 'function'
      ? (this.provider as PluggyOpenFinanceProvider)
      : null;
  }

  /**
   * Provedor real disponível? Provedor real sempre vale; sandbox só fora de
   * produção. A variável `OPEN_FINANCE_SANDBOX_IN_PRODUCTION` foi removida de
   * propósito: liberar dado bancário fictício em produção por env var é o tipo
   * de atalho que acaba ligado no ambiente errado.
   */
  private providerLive(): boolean {
    if (!this.provider) return false;
    if (this.provider.kind === 'live') return true;
    return process.env.NODE_ENV !== 'production';
  }
}
