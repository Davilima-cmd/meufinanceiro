/**
 * Sonda end-to-end: sobe o app Nest completo numa porta efêmera e chama a si
 * mesma (register → login → rota protegida), validando banco, argon2, JWT e
 * guards dentro do runtime publicado. Só para diagnóstico.
 */
import 'reflect-metadata';
import { createApp } from '../src/bootstrap';

export default async function handler(req: any, res: any) {
  const out: Record<string, unknown> = {};
  const email = `probe+${Date.now()}@exemplo.test`;

  try {
    const app = await createApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api`;
    out.port = address.port;

    const call = async (path: string, init?: RequestInit) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      const text = await response.text();
      return { status: response.status, body: text.slice(0, 300) };
    };

    out.health = await call('/health');
    const register = await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name: 'Probe', password: 'SenhaForte#2025' }),
    });
    out.register = register;

    const token = /"token":"([^"]+)"/.exec(register.body)?.[1];
    out.hasToken = Boolean(token);

    out.login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'SenhaForte#2025' }),
    });

    out.accountsNoAuth = await call('/accounts');
    if (token) {
      out.accountsAuth = await call('/accounts', {
        headers: { authorization: `Bearer ${token}` },
      });
    }

    await app.close();
    out.ok = true;
  } catch (error) {
    const err = error as { name?: string; message?: string; stack?: string };
    out.error = {
      name: err?.name,
      message: String(err?.message ?? error)
        .replace(/:\/\/[^@\s/]*@/g, '://***@')
        .slice(0, 600),
      stack: String(err?.stack ?? '')
        .replace(/:\/\/[^@\s/]*@/g, '://***@')
        .slice(0, 600),
    };
  }

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(out));
}
