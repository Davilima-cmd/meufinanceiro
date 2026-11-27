import { describe, expect, it, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController, redactSecrets } from '../src/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

const queryRaw = vi.fn();
const prismaMock = { $queryRaw: queryRaw } as unknown as PrismaService;

function makeController() {
  return new HealthController(prismaMock);
}

describe('health endpoint', () => {
  it('reports ok quando o banco está alcançável', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(makeController().getHealth()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
    });
  });

  it('reports degraded com 503 quando o banco está indisponível', async () => {
    queryRaw.mockRejectedValue(new Error('banco indisponível'));
    let error: HttpException | undefined;
    try {
      await makeController().getHealth();
    } catch (e) {
      error = e as HttpException;
    }
    expect(error).toBeInstanceOf(HttpException);
    expect(error?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error?.getResponse()).toEqual({ status: 'degraded', db: 'error' });
  });

  it('registra o motivo da falha no log (before era catch vazio)', async () => {
    queryRaw.mockRejectedValue(new Error('password authentication failed for user "app_api"'));
    const controller = makeController();
    const logged: string[] = [];
    // O logger do Nest é acessado pelo `Logger` interno do controller.
    const logger = (controller as unknown as { logger: { error: (m: string) => void } }).logger;
    logger.error = (message: string) => logged.push(message);

    await expect(controller.getHealth()).rejects.toBeInstanceOf(HttpException);

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('banco inacessível');
    expect(logged[0]).toContain('password authentication failed');
  });

  it('nunca registra a DATABASE_URL (tem a senha do banco)', async () => {
    const url = 'postgresql://app_api:segredo-super-secreto@db.exemplo.com:5432/postgres';
    queryRaw.mockRejectedValue(new Error(`connect ECONNREFUSED ${url}`));
    const controller = makeController();
    const logged: string[] = [];
    const logger = (controller as unknown as { logger: { error: (m: string) => void } }).logger;
    logger.error = (message: string) => logged.push(message);

    await expect(controller.getHealth()).rejects.toBeInstanceOf(HttpException);

    // O driver devolve a string de conexão em algumas falhas: sem redação, a
    // senha do banco ia para o log.
    expect(logged.join(' ')).not.toContain('segredo-super-secreto');
    expect(logged.join(' ')).toContain('postgresql://***@');
  });
});

describe('redactSecrets', () => {
  it('esconde usuário e senha de qualquer URL de conexão', () => {
    expect(redactSecrets('postgresql://app_api:senha@host:5432/db')).toBe(
      'postgresql://***@host:5432/db'
    );
    expect(redactSecrets('redis://default:abc123@cache:6379')).toBe('redis://***@cache:6379');
  });

  it('esconde password= em texto de erro', () => {
    expect(redactSecrets('connection failed password=segredo123 host=db')).toContain(
      'password=***'
    );
  });

  it('não mexe em mensagem sem credencial', () => {
    expect(redactSecrets('connect ECONNREFUSED 10.0.0.1:5432')).toBe(
      'connect ECONNREFUSED 10.0.0.1:5432'
    );
  });
});
