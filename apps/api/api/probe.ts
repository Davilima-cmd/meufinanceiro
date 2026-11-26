/**
 * Sonda instrumentada: registra etapas em `_probe_log` antes de executá-las, para
 * que um crash do processo deixe rastro do último passo alcançado.
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
  const v = new URL(req.url, 'http://x').searchParams.get('v') ?? 'service';
  await log('inicio', { v });

  try {
    await log('typeof $use', typeof (PrismaClient.prototype as any).$use);

    const { EncryptionService } = await import('../src/encryption/encryption.service');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    await log('prisma.service importado');

    const config = {
      get: (key: string) => (key === 'ENCRYPTION_KEY' ? process.env.ENCRYPTION_KEY : undefined),
    } as never;
    const encryption = new EncryptionService(config);
    encryption.onModuleInit();
    await log('encryption pronta');

    if (v === 'ctor') {
      const service = new PrismaService(encryption);
      await log('PrismaService construído');
      await service.$disconnect();
    } else {
      const client = new PrismaClient();
      await log('client cru criado');
      await client.$connect();
      await log('client cru conectado');
      await client.$disconnect();
      await log('client cru desconectado');
    }
  } catch (error) {
    await log('erro', String((error as Error)?.stack ?? error));
  }

  await log('fim');
  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ run }));
}
