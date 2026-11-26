/**
 * Sonda temporária: descobre se a Client Extension de cifragem está sendo
 * aplicada ao cliente injetado pelo Nest. Grava um consentimento pelo cliente
 * de DI e lê o valor bruto no banco. Removida após o diagnóstico.
 */
import 'reflect-metadata';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

export default async function handler(req: any, res: any) {
  const out: Record<string, unknown> = {};
  const email = `probe+${Date.now()}@exemplo.test`;
  const externalId = `diag-${Date.now()}`;
  const apiEmail = `probe-api+${Date.now()}@exemplo.test`;
  const providerAccountId = `acc-hidden-${Date.now()}`;

  try {
    const app = await createApp();
    await app.init();
    const prisma = app.get(PrismaService);

    out.temExtends = typeof (prisma as any).$extends;
    out.modelDelegates = typeof (prisma as any).consent;
    out.temStores = 'constructor' in prisma;

    const user = await prisma.user.create({
      data: { email, name: 'Diag', password: 'x' },
    });
    out.userCriado = Boolean(user?.id);

    await prisma.consent.create({
      data: { userId: user.id, provider: 'diag', externalId },
    });

    const rows = await prisma.$queryRaw<
      Array<{ externalId: string }>
    >`SELECT "externalId" FROM consents WHERE "userId" = ${user.id}`;
    out.valorNoBanco = rows?.[0]?.externalId;
    out.cifrado = String(rows?.[0]?.externalId ?? '').startsWith('enc:');
    out.esperado = externalId;

    // Round-trip pela API: grava via HTTP e confere o que volta e o que fica no banco.
    await app.listen(0);
    const { port } = app.getHttpServer().address() as { port: number };
    const base = `http://127.0.0.1:${port}/api`;
    const call = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      return { status: response.status, text: await response.text() };
    };

    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: apiEmail, name: 'Api', password: 'SenhaForte#2025' }),
    });
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: apiEmail, password: 'SenhaForte#2025' }),
    });
    const token = /"token":"([^"]+)"/.exec(login.text)?.[1];
    const auth = { authorization: `Bearer ${token}` };
    const account = await call('/accounts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'Conta api', type: 'checking' }),
    });
    const accountId = /"id":"([^"]+)"/.exec(account.text)?.[1];
    const created = await call('/open-finance/connections', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ provider: 'api', providerAccountId, accountId }),
    });
    const listed = await call('/open-finance/connections', { headers: auth });
    out.apiCriado = created.status;
    out.apiRespostaEmClaro = created.text.includes(providerAccountId);
    out.apiListaEmClaro = listed.text.includes(providerAccountId);

    const dbRow = await prisma.$queryRaw<
      Array<{ providerAccountId: string }>
    >`SELECT "providerAccountId" FROM bank_connections WHERE provider = 'api' LIMIT 1`;
    out.apiBancoCifrado = String(dbRow?.[0]?.providerAccountId ?? '').startsWith('enc:');

    await app.close();
    out.ok = true;
  } catch (error) {
    const err = error as { name?: string; message?: string };
    out.error = { name: err?.name, message: String(err?.message ?? error).slice(0, 600) };
  }

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(out));
}
