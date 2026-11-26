/**
 * Sonda de bootstrap: cria o app Nest completo via `createApp()`, inicializa,
 * faz um `SELECT 1` e fecha. Serve para validar o runtime publicado.
 * Só para diagnóstico; removida após o deploy validado.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const run = `run-${Date.now()}`;

async function log(step: string, detail: unknown = '') {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO _probe_log (run, step, detail) VALUES ($1, $2, $3)',
      run,
      step,
      typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)
    );
  } catch {
    // best-effort
  }
}

export default async function handler(req: any, res: any) {
  const out: Record<string, unknown> = { run };
  try {
    await log('inicio');
    const { createApp } = await import('../src/bootstrap');
    await log('bootstrap importado');

    const app = await createApp();
    await log('app criado');
    await app.init();
    await log('app init ok');

    const health = await prisma.$queryRaw`SELECT 1 AS ok`;
    out.health = health;
    await log('consulta ok');

    await app.close();
    await log('app fechado');
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
        .slice(0, 800),
    };
    await log('erro', out.error as unknown as string);
  }

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(out));
}
