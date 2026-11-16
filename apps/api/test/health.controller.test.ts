import { describe, expect, it, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from '../src/health/health.controller';
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
});
