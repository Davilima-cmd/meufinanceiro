/**
 * Sonda do app Nest completo: sobe a aplicação (como a função principal) e
 * devolve o erro de inicialização, se houver. Só para diagnosticar produção.
 */
export default async function handler(req: any, res: any) {
  const steps: Record<string, unknown> = { node: process.version };
  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;

  try {
    const { createApp } = await import('../src/bootstrap');
    steps.importBootstrap = 'ok';
    const app = await createApp();
    steps.createApp = 'ok';
    await app.init();
    steps.init = 'ok';
    await app.close();
  } catch (error) {
    const err = error as { message?: string; stack?: string; name?: string };
    steps.failed = err?.name ?? 'Error';
    steps.detail = (err?.message ?? String(error))
      .replace(/:\/\/[^@\s/]*@/g, '://***@')
      .slice(0, 1200);
    steps.stack = (err?.stack ?? '').replace(/:\/\/[^@\s/]*@/g, '://***@').slice(0, 2000);
  }

  res.end(JSON.stringify(steps, null, 2));
}
