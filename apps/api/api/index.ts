import 'reflect-metadata';
import { createApp } from '../src/bootstrap';

/**
 * Função serverless da Vercel (Zero Config).
 *
 * A plataforma compila este arquivo com esbuild, então só o que é importado a
 * partir daqui entra no bundle. `reflect-metadata` precisa ser o primeiro
 * import: sem ele os decorators do Nest não conseguem ler os metadados.
 *
 * O app Nest é montado uma única vez por instância — a promessa fica no escopo
 * do módulo, então invocações "quentes" reaproveitam a aplicação já
 * inicializada — e cada requisição é encaminhada ao router do Express.
 *
 * O `vercel.json` reescreve `/api/*` para cá preservando o caminho original,
 * então o prefixo global `api` do Nest continua valendo.
 */
let appPromise: Promise<import('@nestjs/common').INestApplication> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = createApp().then(async (app) => {
      await app.init();
      return app;
    });
    // Uma falha de inicialização não pode ficar em cache: sem isto toda
    // invocação "quente" herda a mesma promise rejeitada.
    appPromise.catch(() => {
      appPromise = null;
    });
  }
  return appPromise;
}

/**
 * Erros de inicialização acontecem antes do Nest existir, então não há
 * exception filter para tratá-los. Sem este bloco a plataforma devolve um 500
 * opaco; aqui a causa vai no corpo da resposta, com credenciais mascaradas.
 */
function describeError(error: unknown): { error: string; detail: string } {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = message.replace(/:\/\/[^@\s/]*@/g, '://***@');
  return {
    error: 'api_initialization_failed',
    detail: sanitized.slice(0, 800),
  };
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    const instance = app.getHttpAdapter().getInstance();
    await instance(req, res);
  } catch (error) {
    console.error('[api] falha ao inicializar a aplicação', error);

    // `?__diag=1` devolve 200 para que o diagnóstico seja legível por qualquer
    // cliente HTTP (ferramentas de fetch costumam descartar o corpo de um 500).
    const isDiagnostic = String(req.url ?? '').includes('__diag=1');
    const body = describeError(error);
    res.statusCode = isDiagnostic ? 200 : 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(isDiagnostic ? { ...body, env: envSummary() } : body));
  }
}

/** Resumo do ambiente relevante, sem valores sensíveis. */
function envSummary() {
  const url = process.env.DATABASE_URL ?? '';
  return {
    hasDatabaseUrl: Boolean(url),
    databaseHost: url.replace(/^\w+:\/\/[^@]*@/, '').split('/')[0] ?? null,
    hasDirectUrl: Boolean(process.env.DATABASE_URL_DIRECT),
    hasJwtSecret: Boolean(process.env.JWT_SECRET),
    hasEncryptionKey: Boolean(process.env.ENCRYPTION_KEY),
    nodeEnv: process.env.NODE_ENV ?? null,
    node: process.version,
  };
}
