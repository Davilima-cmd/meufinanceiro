/**
 * Sonda de bootstrap instrumentada: módulo vazio vs. com `@nestjs/config` vs.
 * com HealthModule, com heartbeat para detectar bloqueio de event loop.
 * Cada etapa vira uma linha em `_probe_log`. Só diagnóstico.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { HealthModule } from '../src/health/health.module';

const prisma = new PrismaClient();
const run = `run-${Date.now()}`;
let ticks = 0;
let lastStep = 'start';

async function log(step: string, detail: unknown = '') {
  lastStep = step;
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
  const variant = new URL(req.url, 'http://x').searchParams.get('v') ?? 'empty';

  // Heartbeat: se o event loop travar, os ticks param de aparecer.
  const timer = setInterval(() => {
    ticks += 1;
    void log(`tick ${ticks} (após ${lastStep})`);
  }, 2000);
  timer.unref?.();

  try {
    await log('inicio', { variant });

    class EmptyModule {}
    Module({})(EmptyModule);

    class ConfigOnlyModule {}
    Module({ imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] })] })(
      ConfigOnlyModule
    );

    const target =
      variant === 'config' ? ConfigOnlyModule : variant === 'health' ? HealthModule : EmptyModule;

    await log('criando contexto', { variant });
    const ctx = await NestFactory.createApplicationContext(target as never, { logger: false });
    await log('contexto criado');
    await ctx.close();
    await log('contexto fechado');
  } catch (error) {
    await log('erro', String((error as Error)?.message ?? error));
  } finally {
    clearInterval(timer);
  }

  await log('fim');
  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ run, ticks, lastStep }));
}
