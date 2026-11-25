import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';

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

export async function createApp(): Promise<INestApplication> {
  // `rawBody` é o corpo HTTP original, necessário para validar a
  // assinatura HMAC dos webhooks do provedor Open Finance.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
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

  return app;
}
