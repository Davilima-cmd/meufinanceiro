/**
 * Sonda granular: importa um módulo por vez (`?m=<alvo>`) para descobrir qual
 * derruba o processo no runtime publicado.
 */
const TARGETS: Record<string, string> = {
  core: '@nestjs/core',
  common: '@nestjs/common',
  nestconfig: '@nestjs/config',
  nestjwt: '@nestjs/jwt',
  nestpassport: '@nestjs/passport',
  argon2: 'argon2',
  express: 'express',
  appmodule: '../src/app.module',
  encryption: '../src/encryption/encryption.module',
  prisma: '../src/prisma/prisma.module',
  auth: '../src/auth/auth.module',
};

export default async function handler(req: any, res: any) {
  const m = new URL(req.url, 'http://x').searchParams.get('m') ?? 'appmodule';
  const target = TARGETS[m] ?? m;
  const out: Record<string, unknown> = { target };

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;

  try {
    const mod: any = await import(target === 'express' ? 'express' : target);
    out.imported = true;
    out.exports = Object.keys(mod).slice(0, 12);
  } catch (error) {
    const err = error as { name?: string; message?: string; code?: string };
    out.error = {
      name: err?.name,
      code: err?.code,
      message: String(err?.message ?? error)
        .replace(/:\/\/[^@\s/]*@/g, '://***@')
        .slice(0, 700),
    };
  }

  res.end(JSON.stringify(out));
}
