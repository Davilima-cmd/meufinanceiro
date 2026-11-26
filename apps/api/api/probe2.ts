/**
 * Sonda temporária: verifica em produção que os ajustes de saldo passam pelo
 * banco e que o ciclo pendente -> liquidado move o caixa uma única vez.
 */
import 'reflect-metadata';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransactionsService } from '../src/transactions/transactions.service';

export default async function handler(_req: any, res: any) {
  const out: Record<string, unknown> = {};
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      const value = await run();
      out[name] = value === undefined ? 'ok' : value;
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      out[name] = `ERRO: ${message}`;
    }
  };

  try {
    const app = await createApp();
    await app.init();
    const prisma = app.get(PrismaService);
    const service = app.get(TransactionsService);
    const email = `probe2+${Date.now()}@exemplo.test`;
    const user = await prisma.user.create({ data: { email, name: 'Probe', password: 'x' } });
    const account = await prisma.financialAccount.create({
      data: { name: 'Conta probe', type: 'checking', balanceCents: '100000', userId: user.id },
    });
    const saldo = async () =>
      (
        await prisma.financialAccount.findFirst({ where: { id: account.id } })
      )?.balanceCents?.toString();

    out.saldoInicial = await saldo();

    let pendingId = '';
    let paidId = '';
    await step('criaPago', async () => {
      const created = (await service.create(user.id, {
        accountId: account.id,
        description: 'Pago',
        amountCents: '-10000',
        type: 'expense',
        date: '2026-11-20',
        status: 'paid',
      } as never)) as { id: string };
      paidId = created.id;
      return 'ok';
    });
    await step('criaPendente', async () => {
      const created = (await service.create(user.id, {
        accountId: account.id,
        description: 'Pendente',
        amountCents: '-30000',
        type: 'expense',
        date: '2026-11-25',
        dueDate: '2026-11-30',
      } as never)) as { id: string; status: string };
      pendingId = created.id;
      return created.status;
    });
    out.saldoAposCriar = await saldo();

    await step('liquida', async () => {
      const settled = (await service.settle(user.id, pendingId, '2026-11-26')) as {
        status: string;
      };
      return settled.status;
    });
    out.saldoAposLiquidar = await saldo();

    await step('liquidaDeNovo', async () => {
      await service.settle(user.id, pendingId);
      return 'aceitou (errado)';
    });
    out.saldoAposSegundaTentativa = await saldo();

    await step('estornaPago', async () => {
      await service.reverse(user.id, paidId);
      return 'ok';
    });
    out.saldoAposEstorno = await saldo();

    await step('remove', async () => {
      await service.remove(user.id, pendingId);
      return 'ok';
    });
    out.saldoFinal = await saldo();

    const rows = await prisma.$queryRaw<Array<{ status: string; n: bigint }>>`
      SELECT status, count(*) AS n FROM transactions WHERE "accountId" = ${account.id} GROUP BY status`;
    out.banco = rows.map((row: { status: string; n: bigint }) => `${row.status}:${row.n}`);
    out.ok = true;
  } catch (error) {
    out.falhaGeral = error instanceof Error ? error.message : String(error);
  }

  res.status(200).json(out);
}
