/**
 * Sonda temporária: valida em produção que a Client Extension de cifragem está
 * ativa (grava um BankConnection pela API e confere o valor no banco pelo cliente
 * estendido). Removida assim que o deploy for validado.
 */
import 'reflect-metadata';
import { createApp } from '../src/bootstrap';

export default async function handler(req: any, res: any) {
  const out: Record<string, unknown> = {};
  const email = `probe+${Date.now()}@exemplo.test`;
  const providerAccountId = `acc-${Date.now()}`;

  try {
    const app = await createApp();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as { port: number };
    const base = `http://127.0.0.1:${port}/api`;

    const call = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      const text = await response.text();
      return { status: response.status, body: text.slice(0, 400) };
    };

    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name: 'Probe', password: 'SenhaForte#2025' }),
    });
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'SenhaForte#2025' }),
    });
    const token = /"token":"([^"]+)"/.exec(login.body)?.[1];
    const auth = { authorization: `Bearer ${token}` };

    const account = await call('/accounts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'Conta probe', type: 'checking' }),
    });
    out.accountStatus = account.status;
    const accountId = /"id":"([^"]+)"/.exec(account.body)?.[1];

    const connection = await call('/open-finance/connections', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ provider: 'probe', providerAccountId, accountId }),
    });
    out.connectionStatus = connection.status;
    // Resposta da API deve voltar em claro (extension decifra na leitura).
    out.respostaEmClaro = connection.body.includes(providerAccountId);

    const listed = await call('/open-finance/connections', { headers: auth });
    out.listagemEmClaro = listed.body.includes(providerAccountId);
    out.listagemResposta = listed.body.slice(0, 260);

    await app.close();
    out.ok = true;
  } catch (error) {
    const err = error as { name?: string; message?: string; stack?: string };
    out.error = {
      name: err?.name,
      message: String(err?.message ?? error)
        .replace(/:\/\/[^@\s/]*@/g, '://***@')
        .slice(0, 500),
      stack: String(err?.stack ?? '')
        .replace(/:\/\/[^@\s/]*@/g, '://***@')
        .slice(0, 500),
    };
  }

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(out));
}
