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
import 'reflect-metadata';

let appPromise: Promise<import('@nestjs/common').INestApplication> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = createApp().then(async (app) => {
      await app.init();
      return app;
    });
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  const app = await getApp();
  const instance = app.getHttpAdapter().getInstance();
  await instance(req, res);
}
