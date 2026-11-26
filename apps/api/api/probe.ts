/**
 * Sonda instrumentada do bootstrap: registra cada etapa em `_probe_log` antes de
 * executá-la, para que um crash deixe rastro do último passo alcançado.
 * `?kind=context` cria só o contexto Nest (sem HTTP); `?kind=http` cria o app
 * completo com o adaptador Express. Só diagnóstico.
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
    // canal de log best-effort
  }
}

export default async function handler(req: any, res: any) {
  const params = new URL(req.url, 'http://x').searchParams;
  const kind = params.get('kind') ?? 'context';
  await log('start', { kind });

  try {
    const { Module } = await import('@nestjs/common');
    const { ConfigModule } = await import('@nestjs/config');
    const { NestFactory } = await import('@nestjs/core');
    const { HealthModule } = await import('../src/health/health.module');
    await log('imports ok');

    class ProbeModule {}
    Module({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }), HealthModule],
    })(ProbeModule);
    await log('module decorated');

    if (kind === 'context') {
      await log('creating context');
      const ctx = await NestFactory.createApplicationContext(ProbeModule as never, {
        logger: false,
      });
      await log('context created');
      await ctx.close();
      await log('context closed');
    } else {
      await log('creating http app');
      const app = await NestFactory.create(ProbeModule as never, { logger: false });
      await log('http app created');
      await app.init();
      await log('http app init ok');
      await app.close();
      await log('http app closed');
    }
  } catch (error) {
    await log('error', String((error as Error)?.message ?? error));
  }

  await log('done');
  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ run }));
}
