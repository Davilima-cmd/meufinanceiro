/**
 * Sonda temporária: exercita o ciclo de liquidação direto nos serviços (sem
 * socket), capturando a mensagem de cada falha. Removida após a verificação.
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
      out[name] =
        `ERRO: ${error instanceof Error ? error.message.split('\n').slice(-2).join(' ') : String(error)}`;
    }
  };

  try {
    const app = await createApp();
    await app.init();
    const prisma = app.get(PrismaService);
    const service = app.get(TransactionsService);
    const email = `probe2+${Date.now()}@exemplo.test`;

    const user = await prisma.user.create({
      data: { email, name: 'Probe', password: 'x' },
    });
    const account = await prisma.financialAccount.create({
      data: { name: 'Conta probe', type: 'checking', balanceCents: '100000', userId: user.id },
    });

    await step('formasAceitas', async () => {
      const tentativas: Record<string, string> = {};
      for (const [label, value] of Object.entries({
        bigint: 100n,
        string: '100',
        number: 100,
      })) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.financialAccount.update({
              where: { id: account.id },
              data: { balanceCents: { increment: value as never } },
            });
            throw new Error('rollback');
          });
          tentativas[label] = 'aceito';
        } catch (error) {
          const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
          tentativas[label] = message === 'rollback' ? 'aceito' : message;
        }
      }
      return { ...tentativas, ...(counters() && {}) };
    });

    let pendingId = '';
    await step('criaPago', async () => {
      const created = await service.create(user.id, {
        accountId: account.id,
        description: 'Pago',
        amountCents: '-10000',
        type: 'expense',
        date: '2026-11-20',
        status: 'paid',
      } as never);
      return (created as { id: string }).id ? 'criado' : 'sem-id';
    });
    await step('criaPendente', async () => {
      const created = await service.create(user.id, {
        accountId: account.id,
        description: 'Pendente',
        amountCents: '-30000',
        type: 'expense',
        date: '2026-11-25',
        dueDate: '2026-11-30',
      } as never);
      pendingId = (created as { id: string }).id;
      return (created as { status: string }).status;
    });
    await step('saldo', async () => {
      const row = await prisma.financialAccount.findFirst({ where: { id: account.id } });
      return row?.balanceCents?.toString();
    });
    await step('liquida', async () => {
      const settled = await service.settle(user.id, pendingId, '2026-11-26');
      return (settled as { status: string }).status;
    });
    await step('saldoAposLiquidar', async () => {
      const row = await prisma.financialAccount.findFirst({ where: { id: account.id } });
      return row?.balanceCents?.toString();
    });
    out.ok = true;
  } catch (error) {
    out.falhaGeral = error instanceof Error ? error.message : String(error);
  }

  res.status(200).json(out);
}
