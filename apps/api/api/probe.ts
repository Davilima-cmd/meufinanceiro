/**
 * Sonda instrumentada: grava cada etapa em `_probe_log` antes de executá-la, de
 * modo que um crash do processo ainda deixa rastro do último passo alcançado.
 * Só para diagnóstico; removida após o deploy validado.
 */
import { PrismaClient } from '@prisma/client';
import { HealthModule } from '../src/health/health.module';
import { AppModule } from '../src/app.module';

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
  const m = new URL(req.url, 'http://x').searchParams.get('m') ?? 'health';
  await log('start', { m });

  try {
    await log('importing nest');
    const { Module } = await import('@nestjs/common');
    const { ConfigModule } = await import('@nestjs/config');
    const { NestFactory } = await import('@nestjs/core');
    await log('nest imported');

    class ProbeModule {}
    Module({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        ...(m === 'health' ? [HealthModule] : []),
        ...(m === 'app' ? [AppModule] : []),
      ],
    })(ProbeModule);
    await log('module decorated');

    const app = await NestFactory.create(ProbeModule as never, { logger: false });
    await log('app created');
    await app.init();
    await log('app init ok');
    await app.close();
    await log('app closed');
  } catch (error) {
    await log('error', String((error as Error)?.message ?? error));
  }

  await log('done');
  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ run }));
}
