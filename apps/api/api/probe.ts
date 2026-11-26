/**
 * Sonda de dependências nativas/críticas, uma por requisição (`?m=`), para achar
 * o que derruba o processo no runtime publicado. Imports estáticos: a Vercel só
 * empacota o que é alcançável estaticamente.
 */
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '../src/encryption/encryption.service';

export default async function handler(req: any, res: any) {
  const m = new URL(req.url, 'http://x').searchParams.get('m') ?? 'argon2';
  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  const out: Record<string, unknown> = { probe: m };

  try {
    if (m === 'argon2') {
      const hash = await argon2.hash('senha-de-teste', { type: argon2.argon2id });
      out.verify = await argon2.verify(hash, 'senha-de-teste');
    } else if (m === 'prisma') {
      const prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1`;
        out.query = 'ok';
      } finally {
        await prisma.$disconnect();
      }
    } else if (m === 'encryption') {
      const config = {
        get: (key: string) => (key === 'ENCRYPTION_KEY' ? process.env.ENCRYPTION_KEY : undefined),
      } as never;
      const service = new EncryptionService(config);
      service.onModuleInit();
      const cipher = service.encrypt('texto');
      out.roundTrip = service.decrypt(cipher) === 'texto';
    }
  } catch (error) {
    const err = error as { name?: string; message?: string };
    out.error = {
      name: err?.name,
      message: String(err?.message ?? error)
        .replace(/:\/\/[^@\s/]*@/g, '://***@')
        .slice(0, 500),
    };
  }

  res.end(JSON.stringify(out));
}
