/**
 * Sonda intermediária: importa o Prisma Client gerado e abre uma conexão, sem
 * carregar o Nest. Revela falhas de engine ou de `DATABASE_URL` isoladamente.
 */
export default async function handler(_req: any, res: any) {
  const steps: Record<string, unknown> = { node: process.version };
  res.setHeader('content-type', 'application/json');

  try {
    const { PrismaClient } = await import('@prisma/client');
    steps.prismaImport = 'ok';
    const prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      steps.query = 'ok';
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    steps.query = 'error';
    steps.detail = (error instanceof Error ? error.message : String(error))
      .replace(/:\/\/[^@\s/]*@/g, '://***@')
      .slice(0, 600);
  }

  res.statusCode = 200;
  res.end(JSON.stringify(steps));
}
