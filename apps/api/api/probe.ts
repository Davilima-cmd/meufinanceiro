/**
 * Sonda do app Nest em etapas (`?step=import|create|init`): isola em qual passo
 * a inicialização quebra. Só para diagnosticar o ambiente publicado.
 */
function describe(error: unknown) {
  const err = error as { name?: string; message?: string; stack?: string };
  return {
    name: err?.name ?? typeof error,
    message: String(err?.message ?? error)
      .replace(/:\/\/[^@\s/]*@/g, '://***@')
      .slice(0, 700),
    stack: String(err?.stack ?? '')
      .replace(/:\/\/[^@\s/]*@/g, '://***@')
      .slice(0, 900),
  };
}

export default async function handler(req: any, res: any) {
  const step = new URL(req.url, 'http://x').searchParams.get('step') ?? 'init';
  const out: Record<string, unknown> = { step };

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;

  try {
    const mod = await import('../src/bootstrap');
    out.import = 'ok';

    if (step === 'import') {
      out.exports = Object.keys(mod);
      res.end(JSON.stringify(out));
      return;
    }

    const app = await mod.createApp();
    out.createApp = 'ok';

    if (step === 'create') {
      res.end(JSON.stringify(out));
      return;
    }

    await app.init();
    out.init = 'ok';
    out.routes = 'ok';
  } catch (error) {
    out.error = describe(error);
  }

  res.end(JSON.stringify(out));
}
