import { Controller, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Esconde credenciais em texto de erro.
 *
 * Mensagens do driver (`pg`, pooler) às vezes carregam a string de conexão,
 * que inclui usuário e **senha** do banco. Log é lugar persistente e lido por
 * mais gente que a variável de ambiente — a URL vira `postgresql://***`.
 */
export function redactSecrets(message: string): string {
  return message
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@')
    .replace(/(password|senha|pwd)\s*=\s*[^\s;,'"]+/gi, '$1=***');
}

/**
 * Health check da API.
 *
 * Verifica também o alcance do banco: responde 503 quando o PostgreSQL não
 * está acessível, para que o orquestrador (Docker, Azure Container Apps,
 * Vercel) possa reiniciar o container em vez de considerar a API saudável.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<{ status: 'ok' | 'degraded'; db: 'ok' | 'error' }> {
    let db: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      // `catch {}` engolia o motivo: a resposta era sempre "db: error" e não
      // havia como saber se era credencial errada, banco fora do ar ou pool
      // esgotado. O log guarda a mensagem (sem a `DATABASE_URL`, que tem senha).
      db = 'error';
      this.logger.error(
        `Health check: banco inacessível — ${redactSecrets(
          error instanceof Error ? error.message : String(error)
        )}`
      );
    }

    if (db === 'error') {
      throw new HttpException({ status: 'degraded', db: 'error' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok', db: 'ok' };
  }
}
