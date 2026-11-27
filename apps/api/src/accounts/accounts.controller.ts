import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { centsToString, type DecimalLike } from '../common/money';
import { accessFromShares } from '../common/account-access';
import { AccountAccessService } from '../common/account-access.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

interface ShareRow {
  accountId: string;
  level: string;
  owner: { id: string; name: string };
}

interface AccountRow {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  currency: string;
  balanceCents: DecimalLike;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ACCOUNT_SELECT = {
  userId: true,
  id: true,
  name: true,
  institution: true,
  type: true,
  currency: true,
  balanceCents: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Dono da conta: vê tudo e escreve. Compartilhada: somente leitura. */
const OWNER_ACCESS = { canSeeBalance: true, canSeeTransactions: true, readOnly: false };

/**
 * Forma pública da conta.
 *
 * Campos são listados um a um de propósito: o `select` precisa trazer `userId`
 * para decidir quem é o dono, mas ele **não** é dado de resposta. O
 * `{ ...account }` anterior vazava o id interno do usuário em cada item —
 * `ownerId` (que o cliente realmente usa) já é devolvido explicitamente.
 */
function toJson(account: AccountRow) {
  return {
    id: account.id,
    name: account.name,
    institution: account.institution,
    type: account.type,
    currency: account.currency,
    balanceCents: centsToString(account.balanceCents),
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

@Controller('accounts')
@UseGuards(AuthGuard('jwt'))
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService
  ) {}

  /**
   * Contas que o usuário enxerga: as próprias e as compartilhadas com ele.
   *
   * Cada item diz o que ele pode fazer (`access`): conta compartilhada é
   * somente leitura, e `BALANCE_ONLY` não expõe histórico — a interface usa
   * esses campos para não oferecer uma ação que a API vai recusar.
   */
  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const accounts: AccountRow[] = await this.prisma.financialAccount.findMany({
      where: this.access.listAccountsWhere(userId),
      orderBy: { createdAt: 'desc' },
      select: ACCOUNT_SELECT,
    });

    const shared: ShareRow[] = await this.prisma.accountShare.findMany({
      where: { sharedWithId: userId, revokedAt: null },
      select: { accountId: true, level: true, owner: { select: { id: true, name: true } } },
    });
    const shareByAccount = new Map(shared.map((row) => [row.accountId, row]));

    return accounts.map((account) => {
      const ownerId = (account as AccountRow & { userId: string }).userId;
      if (ownerId === userId) {
        return {
          ...toJson(account),
          ownerId,
          ownerName: null,
          shareLevel: 'private',
          access: OWNER_ACCESS,
        };
      }
      const share = shareByAccount.get(account.id);
      const access = accessFromShares(share ? [{ sharedWithId: userId, level: share.level }] : []);
      return {
        ...toJson(account),
        ownerId,
        ownerName: share?.owner.name ?? null,
        shareLevel: (share?.level ?? 'private') as string,
        access,
      };
    });
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAccountDto) {
    const initial = BigInt(dto.balanceCents ?? '0');

    const account: AccountRow = await this.prisma.$transaction(async (tx) => {
      const created: AccountRow = await tx.financialAccount.create({
        data: {
          name: dto.name,
          institution: dto.institution ?? null,
          type: dto.type ?? 'manual',
          currency: dto.currency ?? 'BRL',
          balanceCents: initial.toString(),
          userId: req.user.userId,
        },
        select: ACCOUNT_SELECT,
      });

      // O saldo inicial entra como movimento, para o histórico explicar o saldo.
      if (initial !== 0n) {
        await tx.transaction.create({
          data: {
            accountId: created.id,
            userId: req.user.userId,
            description: 'Saldo inicial',
            amountCents: initial.toString(),
            type: initial > 0n ? 'income' : 'expense',
            origin: 'manual',
            date: new Date(),
            // O saldo inicial já é caixa: nasce liquidado, senão o saldo da
            // conta (derivado do histórico) começaria zerado.
            competenceDate: new Date(),
            status: 'paid',
            paidAt: new Date(),
          },
        });
      }

      return created;
    });

    return toJson(account);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto
  ) {
    // Só o dono edita/arquiva; conta compartilhada responde `403`.
    await this.access.assertWritable(req.user.userId, id);

    const result = await this.prisma.financialAccount.updateMany({
      where: { id, userId: req.user.userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.institution !== undefined ? { institution: dto.institution } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException('Conta não encontrada');

    const account: AccountRow | null = await this.prisma.financialAccount.findFirst({
      where: { id, userId: req.user.userId },
      select: ACCOUNT_SELECT,
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
    return toJson(account);
  }

  /**
   * Exclusão lógica da conta.
   *
   * Antes havia `DELETE` físico, recusado quando a conta tinha histórico — o
   * usuário ficava sem saída (não dava para excluir nem para arquivar de vez).
   * Agora a conta some das telas e dos totais (`deletedAt`), o histórico
   * permanece no banco e o caminho continua sendo "arquivar" para quem só
   * quer esconder sem excluir.
   */
  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.access.assertWritable(req.user.userId, id);

    const now = new Date();
    // `.catch(() => undefined)` não: as duas escritas precisam ser atômicas,
    // senão a conta some e os lançamentos ficam visíveis na tela de parceiro.
    await this.prisma.$transaction(async (tx) => {
      await tx.financialAccount.update({
        where: { id },
        data: { deletedAt: now, isActive: false },
      });
      await tx.transaction.updateMany({
        where: { accountId: id, deletedAt: null },
        data: { deletedAt: now },
      });
      // Compartilhamento de conta excluída não deve continuar valendo.
      await tx.accountShare.updateMany({
        where: { accountId: id, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    return { deleted: 1 };
  }
}
