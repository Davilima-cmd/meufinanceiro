import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Origens permitidas para o navegador (CORS).
 *
 * `WEB_ORIGIN` aceita uma lista separada por vírgula. Em desenvolvimento
 * o padrão permite apenas o localhost; em produção a variável é obrigatória
 * e a API não sobe sem ela — evita CORS aberto por accidento.
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

async function bootstrap(): Promise<void> {
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
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
