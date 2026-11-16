import { describe, it, expect } from 'vitest';
import { SandboxController } from '../src/open-finance/sandbox.controller';
import { OpenFinanceController } from '../src/open-finance/open-finance.controller';
import { buildControllers } from '../src/open-finance/open-finance.module';
import { AuthGuard } from '@nestjs/passport';

/**
 * C5 - SandboxController sem autenticação.
 *
 * O controller do sandbox de Open Finance era registrado no AppModule sem
 * nenhuma guard: qualquer cliente podia criar consentimento para um
 * `userId` arbitrário e injetar transações.
 */
describe('C5 - protecao do SandboxController', () => {
  it('o SandboxController exige autenticacao (guard JWT na classe)', () => {
    const guards = Reflect.getMetadata('__guards__', SandboxController);
    expect(Array.isArray(guards)).toBe(true);
    expect(guards?.length).toBeGreaterThan(0);
    expect(guards).toContain(AuthGuard('jwt'));
  });

  it('a lista de controllers exclui o sandbox em producao', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const producao = buildControllers();
      expect(producao).not.toContain(SandboxController);
      expect(producao).toContain(OpenFinanceController);

      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      const dev = buildControllers();
      expect(dev).toContain(SandboxController);
      expect(dev).toContain(OpenFinanceController);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    }
  });
});
