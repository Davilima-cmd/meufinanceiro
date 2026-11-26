/**
 * Sonda de travamento: corre a criação do app Nest contra um limite de tempo e
 * captura exceções globais, para diferenciar "hang" de "crash" no runtime
 * publicado. Só para diagnóstico; removida após o deploy validado.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { HealthModule } from '../src/health/health.module';
import { PrismaModule } from '../src/prisma/prisma.module';

const captured: Record<string, unknown>[] = [];

process.on('uncaughtException', (error) => {
  captured.push({ kind: 'uncaughtException', message: String(error?.message ?? error) });
});
process.on('unhandledRejection', (reason) => {
  captured.push({ kind: 'unhandledRejection', message: String(reason) });
});

export default async function handler(req: any, res: any) {
  const m = new URL(req.url, 'http://x').searchParams.get('m') ?? 'health';
  const ms = Number(new URL(req.url, 'http://x').searchParams.get('ms') ?? 8000);
  const out: Record<string, unknown> = { module: m, ms };

  const work = async () => {
    class ProbeModule {}
    Module({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ...(m === 'health' ? [HealthModule] : []),
        ...(m === 'prisma' ? [PrismaModule] : []),
      ],
    })(ProbeModule);
    out.decorated = true;
    const app = await NestFactory.create(ProbeModule as never, { logger: false });
    out.create = 'ok';
    await app.init();
    out.init = 'ok';
    await app.close();
    out.closed = 'ok';
  };

  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
  const raced = await Promise.race([work().then(() => 'done'), timeout]);
  out.result = raced;

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ ...out, captured }));
}
