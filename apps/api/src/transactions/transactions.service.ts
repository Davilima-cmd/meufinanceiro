import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { centsToString, type DecimalLike } from '../common/money';
import type { CreateTransactionDto } from './dto/transaction.dto';

/**
 * Tipagem mínima do cliente dentro de `$transaction`. O cliente gerado pelo
 * Prisma substitui este tipo quando `prisma generate` roda; enquanto isso o shim
 * de `prisma-client.d.ts` deixa tudo como `any`, e o TypeScript exigiria
 * anotação explícita nos callbacks.
 */
type TxClient = PrismaService;

/**
 * Regras financeiras dos lançamentos, centralizadas no backend (a web e o app
 * mobile apenas refletem o resultado).
 *
 * - O saldo da conta é sempre derivado do histórico: cada operação roda dentro
 *   de uma transação de banco e ajusta `balanceCents` pelo mesmo delta que
 *   grava no lançamento. Nunca há saldo "editado à mão".
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

  async list(userId: string) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    });
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
      where: { id: dto.accountId, userId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, OR: [{ userId }, { userId: null, isSystem: true }] },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Categoria não encontrada');
    }

    return this.prisma.$transaction(async (tx: TxClient) => {
      const created = await tx.transaction.create({
        data: {
          accountId: account.id,
          userId,
          description: dto.description,
          amountCents: amount.toString(),
          type: dto.type,
          categoryId: dto.categoryId ?? null,
          origin: 'manual',
          date: new Date(dto.date),
        },
        include: { account: { select: { id: true, name: true } } },
      });

      await tx.financialAccount.update({
        where: { id: account.id },
        data: { balanceCents: { increment: amount } },
      });

      return created;
    });
  }

  /** Remove o lançamento e devolve ao saldo o valor que ele havia aplicado. */
  async remove(userId: string, id: string) {
    const target = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true, accountId: true, amountCents: true, transferId: true },
    });
    if (!target) throw new NotFoundException('Lançamento não encontrado');

    const siblings = target.transferId
      ? await this.prisma.transaction.findMany({
          where: { transferId: target.transferId, userId },
          select: { id: true, accountId: true, amountCents: true },
        })
      : [{ id: target.id, accountId: target.accountId, amountCents: target.amountCents }];

    return this.prisma.$transaction(async (tx: TxClient) => {
      for (const row of siblings as Array<{ accountId: string; amountCents: DecimalLike }>) {
        await tx.financialAccount.update({
          where: { id: row.accountId },
          data: { balanceCents: { decrement: BigInt(centsToString(row.amountCents)) } },
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
    const target = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: {
        id: true,
        accountId: true,
        categoryId: true,
        description: true,
        amountCents: true,
        type: true,
        date: true,
        transferId: true,
      },
    });
    if (!target) throw new NotFoundException('Lançamento não encontrado');
    if (target.transferId) {
      throw new BadRequestException(
        'Estorno de transferência deve ser feito removendo o lançamento (as duas pontas são estornadas juntas).'
      );
    }

    const inverse = -BigInt(target.amountCents.toString());

    return this.prisma.$transaction(async (tx: TxClient) => {
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
        },
        include: { account: { select: { id: true, name: true } } },
      });

      await tx.financialAccount.update({
        where: { id: target.accountId },
        data: { balanceCents: { increment: inverse } },
      });

      return created;
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
      where: { id: { in: [dto.accountId, targetAccountId] }, userId },
      select: { id: true },
    });
    if (accounts.length !== 2) throw new NotFoundException('Conta não encontrada');

    const value = amount < 0n ? -amount : amount;
    const transferId = randomUUID();
    const when = new Date(dto.date);

    return this.prisma.$transaction(async (tx: TxClient) => {
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
          },
          include: { account: { select: { id: true, name: true } } },
        }),
      ]);

      await tx.financialAccount.update({
        where: { id: dto.accountId },
        data: { balanceCents: { decrement: value } },
      });
      await tx.financialAccount.update({
        where: { id: targetAccountId },
        data: { balanceCents: { increment: value } },
      });

      return { transferId, transactions: [debit, credit] };
    });
  }
}
