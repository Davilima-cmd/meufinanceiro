/**
 * Sonda do bootstrap Nest em etapas (`?step=import|create|init`) para isolar
 * falhas de inicialização no runtime publicado.
 */
function describe(error: unknown) {
  const err = error as { name?: string; message?: string; stack?: string };
  return {
    name: err?.name ?? typeof error,
    code: (err as { code?: string })?.code,
    message: String(err?.message ?? error)
      .replace(/:\/\/[^@\s/]*@/g, '://***@')
      .slice(0, 700),
    stack: String(err?.stack ?? '')
      .replace(/:\/\/[^@\s/]*@/g, '://***@')
      .slice(0, 1200),
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

    const app = await mod.createApp();
    out.createApp = 'ok';

    if (step !== 'import') {
      await app.init();
      out.init = 'ok';
    }

    await app.close();
    out.closed = 'ok';
  } catch (error) {
    out.error = describe(error);
  }

  res.end(JSON.stringify(out));
}
