import { describe, expect, it } from 'vitest';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { AuthController } from '../src/auth/auth.controller';
import { MfaController } from '../src/mfa/mfa.controller';

/**
 * Limites de requisição nos endpoints sensíveis.
 *
 * O guard global (ThrottlerGuard) é genérico, então o que dá para verificar sem
 * subir HTTP é a **configuração**: cada rota de autenticação precisa ter um
 * limite apertado. Sem isso, um teste de integração passaria mesmo que alguém
 * removesse o `@Throttle` de `/auth/login`.
 */
function limitOf(controller: object, method: string): number | undefined {
  const handler = (controller as Record<string, unknown>)[method] as object;
  return Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler);
}

function ttlOf(controller: object, method: string): number | undefined {
  const handler = (controller as Record<string, unknown>)[method] as object;
  return Reflect.getMetadata(`${THROTTLER_TTL}default`, handler);
}

describe('rate limit nos endpoints de autenticação', () => {
  const auth = AuthController.prototype;
  const mfa = MfaController.prototype;

  it('login aceita no máximo 10 tentativas por minuto', () => {
    expect(limitOf(auth, 'login')).toBe(10);
    expect(ttlOf(auth, 'login')).toBe(60_000);
  });

  it('cadastro aceita no máximo 5 por minuto', () => {
    expect(limitOf(auth, 'register')).toBe(5);
  });

  it('pedido de redefinição de senha é o mais restrito (3 por minuto)', () => {
    expect(limitOf(auth, 'forgotPassword')).toBe(3);
  });

  it('redefinição e verificação de MFA também têm limite', () => {
    expect(limitOf(auth, 'resetPassword')).toBe(10);
    expect(limitOf(mfa, 'verify')).toBe(10);
  });

  it('todas as rotas limitadas usam janela de um minuto', () => {
    for (const [controller, method] of [
      [auth, 'login'],
      [auth, 'register'],
      [auth, 'forgotPassword'],
      [auth, 'resetPassword'],
      [mfa, 'verify'],
    ] as const) {
      expect(ttlOf(controller, method)).toBe(60_000);
    }
  });
});
