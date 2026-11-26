/**
 * Sonda temporária de status/liquidação: percorre o ciclo completo pela API
 * HTTP (pendente -> liquidação -> cancelamento) e confere o saldo em cada
 * passo. Removida logo após a verificação.
 */
import 'reflect-metadata';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

export default async function handler(_req: any, res: any) {
  const out: Record<string, unknown> = {};
  const email = `probe2+${Date.now()}@exemplo.test`;

  try {
    const app = await createApp();
    await app.init();
    const prisma = app.get(PrismaService);
    await app.listen(0);
    const { port } = app.getHttpServer().address() as { port: number };
    const base = `http://127.0.0.1:${port}/api`;
    const call = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      const text = await response.text();
      return { status: response.status, text };
    };
    const idOf = (text: string) => /"id":"([^"]+)"/.exec(text)?.[1];

    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name: 'Probe2', password: 'SenhaForte#2025' }),
    });
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'SenhaForte#2025' }),
    });
    const token = /"token":"([^"]+)"/.exec(login.text)?.[1];
    const auth = { authorization: `Bearer ${token}` };

    const account = await call('/accounts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'Conta probe', type: 'checking', balanceCents: '100000' }),
    });
    const accountId = idOf(account.text);

    const paid = await call('/transactions', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        accountId,
        description: 'Pago agora',
        amountCents: '-10000',
        type: 'expense',
        date: '2026-11-20',
        status: 'paid',
      }),
    });
    out.pagoCriado = paid.status;

    const pending = await call('/transactions', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        accountId,
        description: 'A pagar',
        amountCents: '-30000',
        type: 'expense',
        date: '2026-11-25',
        dueDate: '2026-11-30',
      }),
    });
    const pendingId = idOf(pending.text);
    out.pendenteCriado = pending.status;
    out.pendenteStatus = /"status":"([^"]+)"/.exec(pending.text)?.[1];

    const accountsRightAfterAccount = await call('/accounts', { headers: auth });
    out.saldoAposConta = /"balanceCents":"(-?\d+)"/.exec(accountsRightAfterAccount.text)?.[1];

    const accountsAfterCreate = await call('/accounts', { headers: auth });
    out.saldoSoComPago = /"balanceCents":"(-?\d+)"/.exec(accountsAfterCreate.text)?.[1];

    const settled = await call(`/transactions/${pendingId}/settle`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ paidAt: '2026-11-26' }),
    });
    out.liquidacaoStatus = settled.status;
    out.liquidado = /"status":"([^"]+)"/.exec(settled.text)?.[1];
    const accountsAfterSettle = await call('/accounts', { headers: auth });
    out.saldoAposLiquidar = /"balanceCents":"(-?\d+)"/.exec(accountsAfterSettle.text)?.[1];

    const settleAgain = await call(`/transactions/${pendingId}/settle`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({}),
    });
    out.liquidarDeNovo = settleAgain.status;

    const pending2 = await call('/transactions', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        accountId,
        description: 'A cancelar',
        amountCents: '-5000',
        type: 'expense',
        date: '2026-11-27',
      }),
    });
    const pending2Id = idOf(pending2.text);
    const canceled = await call(`/transactions/${pending2Id}/cancel`, {
      method: 'POST',
      headers: auth,
    });
    out.cancelStatus = canceled.status;
    out.cancelado = /"status":"([^"]+)"/.exec(canceled.text)?.[1];

    const listedPending = await call('/transactions?status=pending', { headers: auth });
    out.listaPendentes = (listedPending.text.match(/"id"/g) ?? []).length;
    const overdue = await call('/transactions?overdue=true', {
      method: 'GET',
      headers: auth,
    });
    out.atrasadosStatus = overdue.status;

    const rows = await prisma.$queryRaw<Array<{ status: string; paidAt: Date | null }>>`
      SELECT status, "paidAt" FROM transactions WHERE "accountId" = ${accountId} ORDER BY "createdAt"`;
    out.banco = rows.map(
      (row: { status: string; paidAt: Date | null }) =>
        `${row.status}:${row.paidAt ? 'com-pago' : 'sem-pago'}`
    );
    out.saldoFinal = (
      await prisma.financialAccount.findFirst({
        where: { id: accountId },
        select: { balanceCents: true },
      })
    )?.balanceCents?.toString();

    await prisma.transaction.deleteMany({
      where: { userId: (await prisma.user.findFirst({ where: { email } }))?.id },
    });
    await prisma.financialAccount.deleteMany({
      where: { userId: (await prisma.user.findFirst({ where: { email } }))?.id },
    });
    await prisma.user.deleteMany({ where: { email } });
    out.limpo = true;
    out.ok = true;
  } catch (error) {
    out.erro = error instanceof Error ? error.message : String(error);
  }

  res.status(200).json(out);
}
