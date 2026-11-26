/**
 * Observabilidade de erros.
 *
 * O Sentry só liga quando `SENTRY_DSN` existe: sem DSN a função não faz nada,
 * então desenvolvimento e CI não dependem de conta externa. `beforeSend` remove
 * cookies e headers de autorização — relatório de erro não pode ser um
 * vazamento de sessão.
 */
import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  if (initialized) return true;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Amostragem baixa: o custo de tracing em serverless é alto e o que
    // interessa aqui é capturar exceções.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-csrf-token'];
        }
      }
      return event;
    },
  });

  initialized = true;
  return true;
}

export function captureException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}

export { Sentry };
