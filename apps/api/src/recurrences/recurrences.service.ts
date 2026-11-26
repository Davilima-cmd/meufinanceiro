import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { type DecimalLike } from '../common/money';

/**
 * Lançamentos recorrentes.
 *
 * O modelo guarda a **regra** (todo mês no dia X, esse valor). A geração é
 * idempotente por construção: cada modelo tem `nextRunAt` e só gera quando a
 * data chegou; depois avançar o cursor. Rodar a rotina duas vezes no mesmo dia
 * não duplica lançamento nenhum.
 *
 * O lançamento gerado nasce `pending`: aluguel do mês que vem é conta a pagar,
 * não dinheiro que saiu do caixa.
 */
@Injectable()
export class RecurrencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.recurrence.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        accountId: true,
        categoryId: true,
        description: true,
        amountCents: true,
        type: true,
        frequency: true,
        dayOfMonth: true,
        nextRunAt: true,
        active: true,
      },
    });

    return rows.map(
      (row: {
        id: string;
        accountId: string;
        categoryId: string | null;
        description: string;
        amountCents: DecimalLike;
        type: string;
        frequency: string;
        dayOfMonth: number;
        nextRunAt: Date;
        active: boolean;
      }) => ({ ...row, amountCents: row.amountCents.toString() })
    );
  }

  async create(
    userId: string,
    input: {
      accountId: string;
      categoryId?: string | null;
      description: string;
      amountCents: string;
      type: string;
      dayOfMonth?: number;
      startAt?: string;
    }
  ) {
    await this.assertWritableAccount(userId, input.accountId);

    const amount = BigInt(input.amountCents);
    if (amount === 0n) throw new BadRequestException('O valor não pode ser zero.');
    if (input.type === 'income' && amount < 0n) {
      throw new BadRequestException('Receita deve ter valor positivo.');
    }
    if (input.type === 'expense' && amount > 0n) {
      throw new BadRequestException('Despesa deve ter valor negativo.');
    }

    const dayOfMonth = clampDay(input.dayOfMonth ?? 1);
    const start = input.startAt ? new Date(input.startAt) : new Date();

    return this.prisma.recurrence.create({
      data: {
        userId,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        description: input.description,
        amountCents: amount.toString(),
        type: input.type,
        dayOfMonth,
        nextRunAt: nextOccurrence(start, dayOfMonth),
      },
    });
  }

  /** Pausa/retoma um modelo recorrente. */
  async setActive(userId: string, id: string, active: boolean) {
    const result = await this.prisma.recurrence.updateMany({
      where: { id, userId },
      data: { active },
    });
    if (result.count === 0) throw new NotFoundException('Recorrência não encontrada');
    return { id, active };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.recurrence.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Recorrência não encontrada');
    return { deleted: result.count };
  }

  /**
   * Gera os lançamentos vencidos. Chamado no boot do servidor e pelo endpoint
   * `POST /recurrences/run` (útil para cron e para testar sob demanda).
   */
  async run(userId?: string): Promise<{ created: number }> {
    const now = new Date();
    const due = await this.prisma.recurrence.findMany({
      where: {
        active: true,
        nextRunAt: { lte: now },
        ...(userId ? { userId } : {}),
      },
      select: {
        id: true,
        userId: true,
        accountId: true,
        categoryId: true,
        description: true,
        amountCents: true,
        type: true,
        dayOfMonth: true,
        nextRunAt: true,
      },
    });

    let created = 0;
    for (const recurrence of due as Array<{
      id: string;
      userId: string;
      accountId: string;
      categoryId: string | null;
      description: string;
      amountCents: DecimalLike;
      type: string;
      dayOfMonth: number;
      nextRunAt: Date;
    }>) {
      const runAt = recurrence.nextRunAt;
      // Lançamento pendente: o valor só entra no saldo quando for liquidado.
      await this.prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            accountId: recurrence.accountId,
            userId: recurrence.userId,
            categoryId: recurrence.categoryId,
            description: recurrence.description,
            amountCents: recurrence.amountCents.toString(),
            type: recurrence.type,
            origin: 'recurring',
            date: runAt,
            competenceDate: runAt,
            dueDate: runAt,
            status: 'pending',
          },
        });
        await tx.recurrence.update({
          where: { id: recurrence.id },
          data: { nextRunAt: nextOccurrence(runAt, recurrence.dayOfMonth) },
        });
      });
      created += 1;
    }

    return { created };
  }

  private async assertWritableAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
  }
}

/** Dia 29–31 em mês curto vira o último dia disponível (28 na prática). */
function clampDay(day: number): number {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new BadRequestException('Informe um dia do mês entre 1 e 31.');
  }
  return Math.min(day, 28);
}

/**
 * Próxima ocorrência depois de `from`, respeitando o dia do mês.
 *
 * A ordem importa: `setMonth` sozinho **estoura** em meses curtos (31 de janeiro
 * + 1 mês vira 3 de março, não 28 de fevereiro). Por isso o dia volta para 1
 * antes de trocar o mês e só depois recebe o dia desejado, limitado ao último
 * dia do mês de destino.
 */
export function nextOccurrence(from: Date, dayOfMonth: number): Date {
  const next = new Date(from.getTime());
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  next.setDate(Math.min(dayOfMonth, daysInMonth(next.getFullYear(), next.getMonth())));
  next.setHours(12, 0, 0, 0);
  return next;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
