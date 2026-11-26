import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { centsToString, decimalOperand, type DecimalLike } from '../common/money';
import { readOnlyAccountError, visibleTransactionsWhere } from '../common/account-access';
import type { CreateTransactionDto, UpdateTransactionDto } from './dto/transaction.dto';

/**
 * Regras financeiras dos lançamentos, centralizadas no backend (a web e o app
 * mobile apenas refletem o resultado).
 *
 * - O saldo da conta é sempre derivado do histórico: cada operação roda dentro
 *   de uma transação de banco e ajusta `balanceCents` pelo mesmo delta que
 *   grava no lançamento. Nunca há saldo "editado à mão".
 * - Só lançamento **liquidado** (`paid`) mexe no saldo. Um `pending` é conta a
 *   pagar/receber: aparece na projeção e no vencimento, mas não é dinheiro no
 *   caixa. Liquidar aplica o valor; cancelar um pendente não aplica nada.
 * - `date` é a data de caixa, `competenceDate` é o mês a que o lançamento
 *   pertence (regime de competência) e `dueDate` é o vencimento.
 * - Transferência cria duas pontas com o mesmo `transferId` (débito na origem,
 *   crédito no destino) e não é contabilizada como receita nem despesa.
 * - Excluir um lançamento estorna o efeito no saldo; nada é apagado sem que a
 *   conta volte ao valor que teria se o lançamento nunca tivesse existido.
 * - Estornar cria uma movimentação inversa referenciada na descrição, em vez de
 *   reescrever o histórico (regra 21.8 da especificação).
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Histórico visível: os próprios lançamentos mais os das contas que o
   * parceiro compartilhou como `FULL`. Conta `BALANCE_ONLY` entra no saldo
   * (na lista de contas), nunca aqui.
   *
   * `status` filtra por situação e `overdue` traz só os pendentes com
   * vencimento no passado — a lista de contas atrasadas.
   */
  async list(userId: string, filters: { status?: string; overdue?: boolean } = {}) {
    const now = new Date();
    return this.prisma.transaction.findMany({
      where: {
        ...visibleTransactionsWhere(userId),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.overdue ? { status: 'pending', dueDate: { lt: now } } : {}),
      },
      orderBy: { date: 'desc' },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            userId: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /**
   * Carrega o lançamento para escrita e garante que a conta é do usuário.
   *
   * Compartilhamento é somente leitura: quem recebeu a conta pode ver o
   * histórico, mas criar, editar, liquidar ou apagar continua sendo ato do dono.
   */
  private async writable<T extends Record<string, unknown>>(
    userId: string,
    id: string,
    select: Record<string, boolean>
  ): Promise<T & { account: { userId: string } }> {
    const row = (await this.prisma.transaction.findFirst({
      where: { id },
      select: { ...select, account: { select: { userId: true } } } as never,
    })) as unknown as (T & { account: { userId: string } }) | null;

    if (!row) throw new NotFoundException('Lançamento não encontrado');
    if (row.account.userId !== userId) throw readOnlyAccountError();
    return row;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    const amount = BigInt(dto.amountCents);
    if (amount === 0n) {
      throw new BadRequestException('O valor do lançamento não pode ser zero.');
    }

    if (dto.type === 'transfer') {
      return this.createTransfer(userId, dto, amount);
    }

    if (dto.type === 'income' && amount < 0n) {
      throw new BadRequestException('Receita deve ter valor positivo.');
    }
    if (dto.type === 'expense' && amount > 0n) {
      throw new BadRequestException('Despesa deve ter valor negativo.');
    }

    const account = await this.prisma.financialAccount.findFirst({
      where: { id: dto.accountId },
      select: { id: true, userId: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
    // Escrever na conta do parceiro não existe em nenhum nível de compartilhamento.
    if (account.userId !== userId) throw readOnlyAccountError();

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, OR: [{ userId }, { userId: null, isSystem: true }] },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Categoria não encontrada');
    }

    const status = dto.status ?? 'pending';
    const when = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          accountId: account.id,
          userId,
          description: dto.description,
          amountCents: amount.toString(),
          type: dto.type,
          categoryId: dto.categoryId ?? null,
          origin: 'manual',
          date: when,
          competenceDate: new Date(dto.competenceDate ?? dto.date),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status,
          paidAt: status === 'paid' ? when : null,
        },
        include: { account: { select: { id: true, name: true } } },
      });

      // Enquanto não liquidado, o lançamento não é dinheiro no caixa.
      if (status === 'paid') {
        await tx.financialAccount.update({
          where: { id: account.id },
          data: { balanceCents: { increment: decimalOperand(amount) } },
        });
      }

      return created;
    });
  }

  /** Remove o lançamento e devolve ao saldo o valor que ele havia aplicado. */
  async remove(userId: string, id: string) {
    const target = await this.writable<{
      id: string;
      accountId: string;
      amountCents: DecimalLike;
      transferId: string | null;
      status: string;
    }>(userId, id, {
      id: true,
      accountId: true,
      amountCents: true,
      transferId: true,
      status: true,
    });

    const siblings = target.transferId
      ? await this.prisma.transaction.findMany({
          where: { transferId: target.transferId, userId },
          select: { id: true, accountId: true, amountCents: true, status: true },
        })
      : [
          {
            id: target.id,
            accountId: target.accountId,
            amountCents: target.amountCents,
            status: target.status,
          },
        ];

    return this.prisma.$transaction(async (tx) => {
      for (const row of siblings as Array<{
        accountId: string;
        amountCents: DecimalLike;
        status: string;
      }>) {
        // Um pendente nunca entrou no saldo: apagar não deve alterá-lo.
        if (row.status !== 'paid') continue;
        await tx.financialAccount.update({
          where: { id: row.accountId },
          data: {
            balanceCents: { decrement: decimalOperand(BigInt(centsToString(row.amountCents))) },
          },
        });
      }
      const result = await tx.transaction.deleteMany({
        where: {
          id: { in: (siblings as Array<{ id: string }>).map((row) => row.id) },
          userId,
        },
      });
      return { deleted: result.count };
    });
  }

  /**
   * Estorno: grava o inverso do lançamento (mesma conta, categoria e data) sem
   * apagar o original. O par fica identificado pelo prefixo "Estorno de".
   */
  async reverse(userId: string, id: string) {
    const target = await this.writable<{
      id: string;
      accountId: string;
      categoryId: string | null;
      description: string;
      amountCents: DecimalLike;
      type: string;
      date: Date;
      transferId: string | null;
      status: string;
      competenceDate: Date;
    }>(userId, id, {
      id: true,
      accountId: true,
      categoryId: true,
      description: true,
      amountCents: true,
      type: true,
      date: true,
      transferId: true,
      status: true,
      competenceDate: true,
    });
    if (target.status !== 'paid') {
      throw new BadRequestException(
        'Só é possível estornar lançamento liquidado. Para desistir de um pendente, remova-o.'
      );
    }
    if (target.transferId) {
      throw new BadRequestException(
        'Estorno de transferência deve ser feito removendo o lançamento (as duas pontas são estornadas juntas).'
      );
    }

    const inverse = -BigInt(target.amountCents.toString());

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          accountId: target.accountId,
          userId,
          categoryId: target.categoryId,
          description: `Estorno de ${target.description}`.slice(0, 255),
          amountCents: inverse.toString(),
          type: target.type === 'income' ? 'expense' : 'income',
          origin: 'manual',
          date: new Date(),
          competenceDate: target.competenceDate,
          status: 'paid',
          paidAt: new Date(),
        },
        include: { account: { select: { id: true, name: true } } },
      });

      await tx.financialAccount.update({
        where: { id: target.accountId },
        data: { balanceCents: { increment: decimalOperand(inverse) } },
      });

      return created;
    });
  }

  /**
   * Corrige um lançamento já existente (valor, descrição, categoria, datas).
   *
   * O saldo só é reajustado quando o lançamento está liquidado: nesse caso a
   * diferença entre o valor antigo e o novo é aplicada na conta. Lançamento
   * cancelado é histórico encerrado — não se edita.
   */
  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const target = await this.writable<{
      id: string;
      accountId: string;
      amountCents: DecimalLike;
      status: string;
      type: string;
    }>(userId, id, {
      id: true,
      accountId: true,
      amountCents: true,
      status: true,
      type: true,
    });
    if (target.status === 'canceled') {
      throw new BadRequestException('Lançamento cancelado não pode ser editado.');
    }

    const previous = BigInt(centsToString(target.amountCents));
    const next = dto.amountCents !== undefined ? BigInt(dto.amountCents) : previous;
    if (next === 0n) {
      throw new BadRequestException('O valor do lançamento não pode ser zero.');
    }
    if (target.type === 'income' && next < 0n) {
      throw new BadRequestException('Receita deve ter valor positivo.');
    }
    if (target.type === 'expense' && next > 0n) {
      throw new BadRequestException('Despesa deve ter valor negativo.');
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, OR: [{ userId }, { userId: null, isSystem: true }] },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Categoria não encontrada');
    }

    const delta = next - previous;
    const movesBalance = target.status === 'paid' && delta !== 0n;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id: target.id },
        data: {
          amountCents: next.toString(),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId ?? null } : {}),
          ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
          ...(dto.competenceDate !== undefined
            ? { competenceDate: new Date(dto.competenceDate) }
            : {}),
          ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        },
        include: { account: { select: { id: true, name: true } } },
      });

      if (movesBalance) {
        await tx.financialAccount.update({
          where: { id: target.accountId },
          data: { balanceCents: { increment: decimalOperand(delta) } },
        });
      }

      return updated;
    });
  }

  /**
   * Liquida um lançamento pendente: aplica o valor no saldo e o marca como pago.
   *
   * É idempotente por status — liquidar duas vezes não duplica o efeito no saldo.
   * O `paidAt` marca a data de caixa (por padrão, agora), enquanto
   * `competenceDate` continua apontando para o mês a que o lançamento pertence.
   */
  async settle(userId: string, id: string, paidAt?: string) {
    const target = await this.writable<{
      id: string;
      accountId: string;
      amountCents: DecimalLike;
      status: string;
      transferId: string | null;
    }>(userId, id, {
      id: true,
      accountId: true,
      amountCents: true,
      status: true,
      transferId: true,
    });
    if (target.status === 'paid') {
      throw new BadRequestException('Lançamento já está liquidado.');
    }
    if (target.status === 'canceled') {
      throw new BadRequestException('Lançamento cancelado não pode ser liquidado.');
    }
    if (target.transferId) {
      throw new BadRequestException('Transferências já são liquidadas na criação.');
    }

    const when = paidAt ? new Date(paidAt) : new Date();
    const amount = BigInt(centsToString(target.amountCents));

    return this.prisma.$transaction(async (tx) => {
      const settled = await tx.transaction.update({
        where: { id: target.id },
        data: { status: 'paid', paidAt: when, date: when },
        include: { account: { select: { id: true, name: true } } },
      });

      await tx.financialAccount.update({
        where: { id: target.accountId },
        data: { balanceCents: { increment: decimalOperand(amount) } },
      });

      return settled;
    });
  }

  /**
   * Cancela um pendente sem efeito financeiro. Lançamento já liquidado não pode
   * ser cancelado: o caminho correto é o estorno, que preserva o histórico.
   */
  async cancel(userId: string, id: string) {
    const target = await this.writable<{
      id: string;
      status: string;
      transferId: string | null;
    }>(userId, id, {
      id: true,
      status: true,
      transferId: true,
    });
    if (target.status === 'paid') {
      throw new BadRequestException(
        'Lançamento liquidado não pode ser cancelado. Use o estorno para reverter mantendo o histórico.'
      );
    }
    if (target.transferId) {
      throw new BadRequestException('Transferência se remove, não se cancela.');
    }

    return this.prisma.transaction.update({
      where: { id: target.id },
      data: { status: 'canceled' },
      include: { account: { select: { id: true, name: true } } },
    });
  }

  private async createTransfer(userId: string, dto: CreateTransactionDto, amount: bigint) {
    const targetAccountId = dto.transferAccountId;
    if (!targetAccountId) {
      throw new BadRequestException('Informe a conta de destino da transferência.');
    }
    if (targetAccountId === dto.accountId) {
      throw new BadRequestException('A conta de origem e a de destino devem ser diferentes.');
    }

    const accounts = await this.prisma.financialAccount.findMany({
      where: { id: { in: [dto.accountId, targetAccountId] } },
      select: { id: true, userId: true },
    });
    if (accounts.length !== 2) throw new NotFoundException('Conta não encontrada');
    // Transferência move dinheiro de verdade: só entre contas próprias.
    if (accounts.some((row: { userId: string }) => row.userId !== userId)) {
      throw readOnlyAccountError();
    }

    const value = amount < 0n ? -amount : amount;
    const transferId = randomUUID();
    const when = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const [debit, credit] = await Promise.all([
        tx.transaction.create({
          data: {
            accountId: dto.accountId,
            userId,
            description: dto.description,
            amountCents: (-value).toString(),
            type: 'transfer',
            categoryId: null,
            origin: 'manual',
            transferId,
            date: when,
            competenceDate: new Date(dto.competenceDate ?? dto.date),
            status: 'paid',
            paidAt: when,
          },
          include: { account: { select: { id: true, name: true } } },
        }),
        tx.transaction.create({
          data: {
            accountId: targetAccountId,
            userId,
            description: dto.description,
            amountCents: value.toString(),
            type: 'transfer',
            categoryId: null,
            origin: 'manual',
            transferId,
            date: when,
            competenceDate: new Date(dto.competenceDate ?? dto.date),
            status: 'paid',
            paidAt: when,
          },
          include: { account: { select: { id: true, name: true } } },
        }),
      ]);

      await tx.financialAccount.update({
        where: { id: dto.accountId },
        data: { balanceCents: { decrement: decimalOperand(value) } },
      });
      await tx.financialAccount.update({
        where: { id: targetAccountId },
        data: { balanceCents: { increment: decimalOperand(value) } },
      });

      return { transferId, transactions: [debit, credit] };
    });
  }
}
