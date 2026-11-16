import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health check da API.
 *
 * Verifica também o alcance do banco: responde 503 quando o PostgreSQL não
 * está acessível, para que o orquestrador (Docker, Azure Container Apps,
 * Vercel) possa reiniciar o container em vez de considerar a API saudável.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<{ status: 'ok' | 'degraded'; db: 'ok' | 'error' }> {
    let db: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }

    if (db === 'error') {
      throw new HttpException({ status: 'degraded', db: 'error' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok', db: 'ok' };
  }
}
