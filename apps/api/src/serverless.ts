import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './bootstrap';

/**
 * Entrypoint da API na Vercel.
 *
 * A plataforma entrega uma requisição por invocação; esta função monta o Nest
 * uma única vez por instância (a promessa fica no escopo do módulo, então
 * invocações "quentes" reaproveitam o app já inicializado) e encaminha a
 * requisição para o router do Express.
 *
 * O `vercel.json` do projeto reescreve `/api/*` para cá preservando o caminho
 * original, então o prefixo global `api` do Nest continua valendo.
 */
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  const instance = app.getHttpAdapter().getInstance();
  await instance(req, res);
}
