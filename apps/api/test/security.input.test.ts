import { describe, expect, it, beforeEach, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginThrottleService } from '../src/auth/login-throttle.service';
import { LoginDto, RegisterDto, PASSWORD_MAX_LENGTH } from '../src/auth/dto/auth.dto';
import { CreateTransactionDto } from '../src/transactions/dto/transaction.dto';
import { UpsertAllocationDto } from '../src/allocations/dto/allocation.dto';
import { EnableMfaDto } from '../src/mfa/dto/mfa.dto';
import { splitAmount } from '../src/allocations/split';
import { ConnectConnectionDto } from '../src/open-finance/dto/connect-connection.dto';

/**
 * Blindagem de **entrada** de dados.
 *
 * O que estes testes protegem: nenhum campo chega ao banco, ao argon2 ou ao
 * cálculo de rateio sem limite de tamanho e sem tipo. Um `password` de 1 MB, um
 * id de 300 KB ou um peso `1e308` são payloads de abuso, não dados.
 */

async function errorsOf<T extends object>(dto: T, body: Record<string, unknown>) {
  const instance = plainToInstance(dto.constructor as new () => T, body);
  return validate(instance as object, { whitelist: true, forbidNonWhitelisted: true });
}

describe('validação de entrada (DTOs)', () => {
  it('recusa senha acima do limite (DoS no argon2)', async () => {
    const errors = await errorsOf(new LoginDto(), {
      email: 'davi@example.com',
      password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('recusa e-mail e nome gigantes no cadastro', async () => {
    const errors = await errorsOf(new RegisterDto(), {
      email: `${'a'.repeat(300)}@example.com`,
      name: 'n'.repeat(500),
      password: 'senha-forte-123',
    });
    const fields = errors.map((error) => error.property);
    expect(fields).toEqual(expect.arrayContaining(['email', 'name']));
  });

  it('recusa id de conta com tamanho absurdo no lançamento', async () => {
    const errors = await errorsOf(new CreateTransactionDto(), {
      accountId: 'x'.repeat(10_000),
      description: 'Mercado',
      amountCents: '-1500',
      type: 'expense',
      date: '2026-11-20',
    });
    expect(errors.map((error) => error.property)).toContain('accountId');
  });

  it('recusa rateio com participantes demais', async () => {
    const errors = await errorsOf(new UpsertAllocationDto(), {
      participants: Array.from({ length: 51 }, (_, index) => `user-${index}`),
    });
    expect(errors.map((error) => error.property)).toContain('participants');
  });

  it('só aceita código TOTP de 6 dígitos e segredo base32', async () => {
    const wrongToken = await errorsOf(new EnableMfaDto(), {
      secret: 'JBSWY3DPEHPK3PXP',
      token: '1234567',
    });
    expect(wrongToken.map((error) => error.property)).toContain('token');

    const wrongSecret = await errorsOf(new EnableMfaDto(), {
      secret: 'segredo-com-hifen-e-minusculas',
      token: '123456',
    });
    expect(wrongSecret.map((error) => error.property)).toContain('secret');

    const ok = await errorsOf(new EnableMfaDto(), { secret: 'JBSWY3DPEHPK3PXP', token: '123456' });
    expect(ok).toHaveLength(0);
  });
  it('recusa ids fora do formato no vínculo manual de conexão', async () => {
    const errors = await errorsOf(new ConnectConnectionDto(), {
      provider: 'pluggy',
      providerAccountId: '<script>alert(1)</script>',
      accountId: 'acc-1',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('recusa provedor desconhecido e campos longos em connect-connection', async () => {
    const errors = await errorsOf(new ConnectConnectionDto(), {
      provider: 'outro',
      providerAccountId: 'a'.repeat(200),
      accountId: 'acc-1',
    });
    // provider inválido + providerAccountId acima de 128
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('aceita um vínculo manual bem formado', async () => {
    const errors = await errorsOf(new ConnectConnectionDto(), {
      provider: 'manual',
      providerAccountId: 'acc_123-abc',
      accountId: 'acc-1',
    });
    expect(errors).toHaveLength(0);
  });
});

describe('LoginThrottleService (força bruta por conta)', () => {
  let throttle: LoginThrottleService;

  beforeEach(() => {
    throttle = new LoginThrottleService();
  });

  it('bloqueia a conta depois de 5 falhas, mesmo trocando de IP', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(throttle.isLocked('davi@example.com')).toBe(false);
      throttle.registerFailure('davi@example.com');
    }
    expect(throttle.isLocked('davi@example.com')).toBe(true);
    // A chave é o e-mail normalizado: caixa diferente é a mesma conta.
    expect(throttle.isLocked('DAVI@example.com')).toBe(true);
  });

  it('login certo zera o histórico de falhas', () => {
    throttle.registerFailure('davi@example.com');
    throttle.registerFailure('davi@example.com');
    throttle.registerSuccess('davi@example.com');
    expect(throttle.isLocked('davi@example.com')).toBe(false);
  });

  it('informa quanto falta do bloqueio (Retry-After)', () => {
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.registerFailure('davi@example.com');
    expect(throttle.retryAfterSeconds('davi@example.com')).toBeGreaterThan(0);
  });

  it('não deixa o mapa crescer sem limite', () => {
    for (let index = 0; index < 12_000; index += 1) {
      throttle.registerFailure(`user-${index}@example.com`);
    }
    // Teto interno: entradas antigas são descartadas, nada explode.
    expect(
      (throttle as unknown as { entries: Map<string, unknown> }).entries.size
    ).toBeLessThanOrEqual(10_000);
  });
});

describe('rateio com pesos hostis', () => {
  it('recusa peso que escalaria para um BigInt gigante', () => {
    expect(() =>
      splitAmount({
        amountCents: 1000n,
        participantIds: ['a', 'b'],
        mode: 'proportional',
        weights: { a: 1e308, b: 1 },
      })
    ).toThrow(/limite/i);
  });

  it('recusa peso zero e negativo', () => {
    for (const weight of [0, -1]) {
      expect(() =>
        splitAmount({
          amountCents: 1000n,
          participantIds: ['a', 'b'],
          mode: 'proportional',
          weights: { a: weight, b: 1 },
        })
      ).toThrow();
    }
  });

  it('mantém a soma exata com pesos fracionários', () => {
    const parts = splitAmount({
      amountCents: 10_000n,
      participantIds: ['a', 'b', 'c'],
      mode: 'proportional',
      weights: { a: 33.333, b: 33.333, c: 33.334 },
    });
    expect(parts.reduce((sum, part) => sum + part.shareCents, 0n)).toBe(10_000n);
  });
});

describe('auditoria de tentativa que falha', () => {
  it('registra a ação mesmo quando o handler lança', async () => {
    const { AuditLogInterceptor } = await import('../src/audit/audit-log.interceptor');
    const { BadRequestException } = await import('@nestjs/common');
    const { of, throwError, lastValueFrom } = await import('rxjs');

    type LogEntry = { action: string; metadata: { body: { password: string } } };
    const log = vi.fn<(entry: LogEntry) => Promise<void>>(async () => undefined);
    const reflector = {
      get: vi.fn(() => 'LOGIN'),
    };
    const interceptor = new AuditLogInterceptor({ log } as never, reflector as never);

    const context = {
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/auth/login',
          route: { path: '/auth/login' },
          body: { email: 'davi@example.com', password: 'segredo' },
          ip: '203.0.113.9',
          params: {},
        }),
        getResponse: () => ({ statusCode: 401 }),
      }),
    } as never;

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new BadRequestException('x')),
        })
      )
    ).rejects.toBeTruthy();

    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0][0] as {
      action: string;
      metadata: { body: { password: string } };
    };
    expect(entry.action).toBe('LOGIN');
    // A senha nunca vai para o log, nem na tentativa falha.
    expect(JSON.stringify(entry.metadata.body)).not.toContain('segredo');
    expect(entry.metadata.body.password).toBe('[REDACTED]');

    // Caminho feliz continua registrando.
    log.mockClear();
    await lastValueFrom(interceptor.intercept(context, { handle: () => of({ id: 'u1' }) }));
    expect(log).toHaveBeenCalledTimes(1);
  });
});
