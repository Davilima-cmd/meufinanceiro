/**
 * Sonda temporária de status/liquidação. Registra o progresso no banco a cada
 * passo (`_probe_out`), porque a resposta HTTP pode estourar o tempo do cliente.
 * Removida logo após a verificação.
 */
import 'reflect-metadata';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

let prisma: PrismaService | null = null;
const steps: string[] = [];
const started = Date.now();

async function log(step: string) {
  steps.push(`${Date.now() - started}ms ${step}`);
  if (!prisma) return;
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_probe_out" (
      id serial PRIMARY KEY, payload text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_probe_out" (payload) VALUES ('${`${steps.at(-1)}`.replace(/'/g, "''")}')`
    );
  } catch {
    /* canal de diagnóstico não pode derrubar a sonda */
  }
}

export default async function handler(_req: any, res: any) {
  const out: Record<string, unknown> = {};
  try {
    await log('inicio');
    const app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    await log('app-iniciado');
    await app.listen(0);
    const { port } = app.getHttpServer().address() as { port: number };
    const base = `http://127.0.0.1:${port}/api`;
    await log('listen');

    const email = `probe2+${Date.now()}@exemplo.test`;
    const call = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      return { status: response.status, text: await response.text() };
    };
    const idOf = (text: string) => /"id":"([^"]+)"/.exec(text)?.[1];

    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name: 'Probe2', password: 'SenhaForte#2025' }),
    });
    await log('registro');
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'SenhaForte#2025' }),
    });
    const token = /"token":"([^"]+)"/.exec(login.text)?.[1];
    const auth = { authorization: `Bearer ${token}` };
    await log('login');

    const account = await call('/accounts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'Conta probe', type: 'checking', balanceCents: '100000' }),
    });
    const accountId = idOf(account.text);
    out.contaCriada = account.status;
    await log('conta');

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
    await log('pago');

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
    await log('pendente');

    const accounts1 = await call('/accounts', { headers: auth });
    out.saldoAposCriar = /"balanceCents":"(-?\d+)"/.exec(accounts1.text)?.[1];
    await log(`saldo-apos-criar=${String(out.saldoAposCriar)}`);

    const settled = await call(`/transactions/${pendingId}/settle`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ paidAt: '2026-11-26' }),
    });
    out.liquidacaoStatus = settled.status;
    out.liquidado = /"status":"([^"]+)"/.exec(settled.text)?.[1];
    await log('liquidadо');

    const accounts2 = await call('/accounts', { headers: auth });
    out.saldoAposLiquidar = /"balanceCents":"(-?\d+)"/.exec(accounts2.text)?.[1];
    await log(`saldo-apos-liquidar=${String(out.saldoAposLiquidar)}`);

    const again = await call(`/transactions/${pendingId}/settle`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({}),
    });
    out.liquidarDeNovo = again.status;
    await log('liquidar-de-novo');

    const extra = await call('/transactions', {
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
    const canceled = await call(`/transactions/${idOf(extra.text)}/cancel`, {
      method: 'POST',
      headers: auth,
    });
    out.cancelado = /"status":"([^"]+)"/.exec(canceled.text)?.[1];
    await log('cancelado');

    const listPending = await call('/transactions?status=pending', { headers: auth });
    out.listaPendentes = (listPending.text.match(/"id"/g) ?? []).length;
    const overdue = await call('/transactions?overdue=true', { headers: auth });
    out.atrasados = overdue.status;
    await log('filtros');

    const db = prisma as PrismaService;
    const rows = await db.$queryRaw<Array<{ status: string; paidAt: Date | null }>>`
      SELECT status, "paidAt" FROM transactions WHERE "accountId" = ${accountId} ORDER BY "createdAt"`;
    out.banco = rows.map(
      (row: { status: string; paidAt: Date | null }) =>
        `${row.status}:${row.paidAt ? 'com-pago' : 'sem-pago'}`
    );
    out.saldoFinal = (
      await db.financialAccount.findFirst({
        where: { id: accountId },
        select: { balanceCents: true },
      })
    )?.balanceCents?.toString();
    out.ok = true;
    await log(`fim=${JSON.stringify(out)}`);
  } catch (error) {
    await log(`erro=${error instanceof Error ? error.message : String(error)}`);
  }
  res.status(200).json(out);
}
