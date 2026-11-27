import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupOpenApi } from './common/openapi';
import { initSentry } from './common/sentry';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Bootstrap compartilhado entre o servidor HTTP (`main.ts`) e a função
 * serverless da Vercel (`serverless.ts`).
 *
 * Manter a configuração num único lugar evita o cenário clássico de a API
 * responder diferente em produção e em desenvolvimento (CORS, prefixo,
 * validação).
 */
function allowedOrigins(): string[] {
  const configured = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('WEB_ORIGIN é obrigatória em produção (ex.: https://app.exemplo.com).');
  }

  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

/**
 * Cabeçalhos de segurança da API.
 *
 * A API só devolve JSON, então o objetivo aqui é fechar o navegador: nada de
 * enquadrar (clickjacking), nada de adivinhar tipo de conteúdo (sniffing de
 * JSON virando HTML), nada de vazar a URL anterior. Sem dependência externa
 * (helmet) porque são cinco headers — e sem anunciar `x-powered-by`.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Corpo máximo aceito: JSON financeiro legítimo fica muito abaixo disso. */
const DEFAULT_MAX_BODY_BYTES = 1_000_000;

/**
 * Lê o limite de corpo da env.
 *
 * `Number('')` é `0` e `Number('1mb')` é `NaN`: os dois passavam direto para o
 * body parser. Com `limit: NaN` o parser compara `bytes > NaN` (sempre falso) e
 * o **limite deixa de existir** — um corpo de 50 MB seria lido inteiro em
 * memória. Com `0`, toda requisição com corpo quebrava. Inválido agora cai no
 * padrão, em vez de desligar a proteção em silêncio.
 */
export function resolveMaxBodyBytes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_BODY_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_BODY_BYTES;
  return Math.floor(parsed);
}

const MAX_BODY_BYTES = resolveMaxBodyBytes(process.env.MAX_BODY_BYTES);

export async function createApp(): Promise<NestExpressApplication> {
  // Sem `SENTRY_DSN` isto é um no-op: nenhum ambiente depende de conta externa.
  initSentry();

  // `rawBody` é o corpo HTTP original, necessário para validar a
  // assinatura HMAC dos webhooks do provedor Open Finance.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Limite de corpo: uma requisição de 50 MB não pode virar consumo de memória
  // (JSON é parseado inteiro antes de qualquer validação de schema).
  app.useBodyParser('json', { limit: MAX_BODY_BYTES });
  app.useBodyParser('urlencoded', { limit: MAX_BODY_BYTES, extended: true });

  app.setGlobalPrefix('api');

  // `disable('x-powered-by')` esconde a stack; os demais headers valem para
  // qualquer resposta, inclusive erro.
  app.getHttpAdapter().getInstance().disable?.('x-powered-by');
  app.use(
    (
      _req: unknown,
      res: { setHeader: (name: string, value: string) => void },
      next: () => void
    ) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(name, value);
      }
      next();
    }
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
  });

  // Necessário para o `req.ip` real atrás de proxy/load balancer (Azure, Vercel).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Erros 5xx viram log + Sentry; 4xx ficam em uma linha de warn.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  // OpenAPI em `/api/docs` (desligado em produção salvo ENABLE_API_DOCS=true).
  setupOpenApi(app);

  return app;
}
