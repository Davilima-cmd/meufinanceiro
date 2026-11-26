/**
 * Sonda de conectividade: tenta variações de host/usuário do pooler do Supabase
 * com o client Prisma já gerado e devolve qual combinação conecta. Existe apenas
 * para diagnosticar o ambiente publicado; remover quando o acesso estabilizar.
 */
const PASSWORD = (process.env.DATABASE_URL ?? '').replace(/^.*:\/\/(?:[^@]*)@/, '').split('@')[0];
const [USERINFO] = (process.env.DATABASE_URL ?? '').split('://')[1]?.split('@') ?? [];
const ROLE = USERINFO?.split(':')[0]?.split('.')[0] ?? 'app_api';
const PASS = USERINFO?.split(':')[1] ?? PASSWORD;
const REF = 'lowevmopfcwafuzfcvqr';

const CANDIDATES = [
  `postgresql://${ROLE}.${REF}:${PASS}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`,
  `postgresql://${ROLE}.${REF}:${PASS}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`,
  `postgresql://${ROLE}.${REF}:${PASS}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`,
  `postgresql://${ROLE}:${PASS}@db.${REF}.supabase.co:5432/postgres`,
];

export default async function handler(_req: any, res: any) {
  const { PrismaClient } = await import('@prisma/client');
  const results: Array<Record<string, unknown>> = [];

  for (const url of CANDIDATES) {
    const label = url.replace(/:\/\/[^@]*@/, '://***@');
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      await client.$queryRaw`SELECT 1`;
      results.push({ url: label, ok: true });
    } catch (error) {
      results.push({
        url: label,
        ok: false,
        detail: (error instanceof Error ? error.message : String(error))
          .replace(/:\/\/[^@\s/]*@/g, '://***@')
          .split('\n')
          .filter(Boolean)
          .pop()
          ?.slice(0, 200),
      });
    } finally {
      await client.$disconnect().catch(() => undefined);
    }
  }

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ role: ROLE, hasPass: Boolean(PASS), results }, null, 2));
}
