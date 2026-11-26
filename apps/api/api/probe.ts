/**
 * Sonda temporária: descobre se a Client Extension de cifragem está sendo
 * aplicada ao cliente injetado pelo Nest. Grava um consentimento pelo cliente
 * de DI e lê o valor bruto no banco. Removida após o diagnóstico.
 */
import 'reflect-metadata';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { extensionCalls } from '../src/prisma/sensitive-fields.extension';

export default async function handler(req: any, res: any) {
  const out: Record<string, unknown> = {};
  const email = `probe+${Date.now()}@exemplo.test`;
  const externalId = `diag-${Date.now()}`;

  try {
    const app = await createApp();
    await app.init();
    const prisma = app.get(PrismaService);

    out.temExtends = typeof (prisma as any).$extends;
    out.modelDelegates = typeof (prisma as any).consent;
    out.temStores = 'constructor' in prisma;

    const user = await prisma.user.create({
      data: { email, name: 'Diag', password: 'x' },
    });
    out.userCriado = Boolean(user?.id);

    await prisma.consent.create({
      data: { userId: user.id, provider: 'diag', externalId },
    });

    const rows = await prisma.$queryRaw<
      Array<{ externalId: string }>
    >`SELECT "externalId" FROM consents WHERE "userId" = ${user.id}`;
    out.valorNoBanco = rows?.[0]?.externalId;
    out.cifrado = String(rows?.[0]?.externalId ?? '').startsWith('enc:');
    out.esperado = externalId;
    out.chamadas = extensionCalls;

    await app.close();
    out.ok = true;
  } catch (error) {
    const err = error as { name?: string; message?: string };
    out.error = { name: err?.name, message: String(err?.message ?? error).slice(0, 600) };
  }

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(out));
}
