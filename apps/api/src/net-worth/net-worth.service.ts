import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { centsToString, type DecimalLike } from '../common/money';

/**
 * Patrimônio: saldo das contas **mais** bens declarados **menos** dívidas.
 *
 * O erro clássico é mostrar só o ativo: um carro de R$ 50 mil financiado em
 * R$ 45 mil não deixa ninguém R$ 50 mil mais rico. Por isso o passivo é
 * primeira classe aqui e o resumo sempre devolve os três números.
 */
@Injectable()
export class NetWorthService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string) {
    const [items, accounts] = await Promise.all([
      this.prisma.netWorthItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.financialAccount.findMany({
        where: { userId, deletedAt: null, isActive: true },
        select: { id: true, name: true, balanceCents: true, type: true },
      }),
    ]);

    const accountsTotalCents = (accounts as Array<{ balanceCents: DecimalLike }>).reduce(
      (total, account) => total + BigInt(centsToString(account.balanceCents)),
      0n
    );

    const assetsCents = (items as Array<{ kind: string; valueCents: DecimalLike }>)
      .filter((item) => item.kind === 'asset')
      .reduce((total, item) => total + BigInt(centsToString(item.valueCents)), 0n);
    const liabilitiesCents = (items as Array<{ kind: string; valueCents: DecimalLike }>)
      .filter((item) => item.kind === 'liability')
      .reduce((total, item) => total + BigInt(centsToString(item.valueCents)), 0n);

    return {
      accountsTotalCents: accountsTotalCents.toString(),
      assetsCents: assetsCents.toString(),
      liabilitiesCents: liabilitiesCents.toString(),
      // Patrimônio líquido: o que sobra se tudo for vendido e as dívidas pagas.
      netCents: (accountsTotalCents + assetsCents - liabilitiesCents).toString(),
      items: (
        items as Array<{
          id: string;
          name: string;
          kind: string;
          valueCents: DecimalLike;
          note: string | null;
        }>
      ).map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        valueCents: centsToString(item.valueCents),
        note: item.note,
      })),
    };
  }

  async create(
    userId: string,
    input: { name: string; kind: string; valueCents: string; note?: string }
  ) {
    this.assertPositive(input.valueCents);
    return this.prisma.netWorthItem.create({
      data: {
        userId,
        name: input.name.trim(),
        kind: input.kind,
        valueCents: input.valueCents,
        note: input.note ?? null,
      },
    });
  }

  async update(
    userId: string,
    id: string,
    input: { name?: string; kind?: string; valueCents?: string; note?: string }
  ) {
    if (input.valueCents !== undefined) this.assertPositive(input.valueCents);
    const result = await this.prisma.netWorthItem.updateMany({
      where: { id, userId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.valueCents !== undefined && { valueCents: input.valueCents }),
        ...(input.note !== undefined && { note: input.note }),
      },
    });
    if (result.count === 0) throw new NotFoundException('Item de patrimônio não encontrado');
    return { id, updated: true };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.netWorthItem.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Item de patrimônio não encontrado');
    return { deleted: result.count };
  }

  /** Valor negativo inverteria o sinal do `kind` e esconderia a dívida. */
  private assertPositive(valueCents: string): void {
    if (BigInt(valueCents) <= 0n) {
      throw new BadRequestException('Informe um valor maior que zero (o sinal vem do tipo).');
    }
  }
}
