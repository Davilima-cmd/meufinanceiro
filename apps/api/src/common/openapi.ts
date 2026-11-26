import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Documentação OpenAPI.
 *
 * Sem isso, a única forma de descobrir o contrato era ler o código. O Swagger
 * fica em `/api/docs` (JSON em `/api/docs-json`), **fora de produção** por
 * padrão: expor o mapa completo da API num app financeiro é entregar de graça
 * a superfície de ataque. Para habilitar em produção, defina
 * `ENABLE_API_DOCS=true`.
 */
export function isDocsEnabled(): boolean {
  if (process.env.ENABLE_API_DOCS === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export function setupOpenApi(app: INestApplication): void {
  if (!isDocsEnabled()) return;

  const config = new DocumentBuilder()
    .setTitle('Meu Financeiro — API')
    .setDescription(
      [
        'API do painel financeiro a dois.',
        '',
        'Autenticação: `Authorization: Bearer <JWT>` **ou** cookie `HttpOnly` `mf_session`',
        '(a web usa o cookie; nesse caso, escritas precisam do header `X-CSRF-Token`',
        'igual ao cookie `mf_csrf`).',
        '',
        'Dinheiro sempre em centavos, como string (nunca ponto flutuante).',
      ].join('\n')
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token de /auth/login' },
      'bearer'
    )
    .addCookieAuth('mf_session')
    .addTag('auth', 'Cadastro, login, sessão, MFA e recuperação de senha')
    .addTag('accounts', 'Contas e carteiras (próprias e compartilhadas)')
    .addTag('transactions', 'Lançamentos, liquidação e estorno')
    .addTag('categories', 'Categorias')
    .addTag('budgets', 'Orçamentos por categoria e período')
    .addTag('goals', 'Metas financeiras')
    .addTag('sharing', 'Parceria do casal e nível de compartilhamento por conta')
    .addTag('open-finance', 'Conexões Open Finance em sandbox')
    .addTag('sync', 'Sincronização com o provedor')
    .addTag('health', 'Health check')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
