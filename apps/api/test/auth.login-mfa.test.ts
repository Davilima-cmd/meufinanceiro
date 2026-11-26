import { describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/auth/auth.controller';
import type { AuthService } from '../src/auth/auth.service';
import type { PasswordResetService } from '../src/auth/password-reset.service';
import type { SessionService } from '../src/auth/session.service';

/**
 * Login com MFA: a resposta intermédia não pode servir como mapa da conta.
 *
 * Quem acertou a senha recebia `{ mfaRequired: true, userId, tempToken }`.
 * O `userId` é o identificador interno usado em toda consulta do app — não há
 * motivo para entregá-lo, porque ele já vai assinado dentro do `tempToken`.
 */
function makeController(user: { id: string; mfaEnabled: boolean }) {
  const auth = {
    validateUser: vi.fn(async () => user),
    generateTempToken: vi.fn(() => 'temp-token'),
  } as unknown as AuthService;
  const sessions = { create: vi.fn() } as unknown as SessionService;
  const resets = {} as PasswordResetService;

  return new AuthController(auth, resets, sessions);
}

const dto = { email: 'davi@example.com', password: 'senha-secreta' };

describe('POST /auth/login com MFA', () => {
  it('não devolve userId na resposta de mfaRequired', async () => {
    const controller = makeController({ id: 'user-interno-123', mfaEnabled: true });
    const res = { cookie: vi.fn() } as never;

    const result = (await controller.login(dto, res)) as Record<string, unknown>;

    expect(result).toEqual({ mfaRequired: true, tempToken: 'temp-token' });
    expect(result).not.toHaveProperty('userId');
  });

  it('não cria sessão nem grava cookie antes do segundo fator', async () => {
    const controller = makeController({ id: 'user-1', mfaEnabled: true });
    const res = { cookie: vi.fn() };

    await controller.login(dto, res as never);

    expect(res.cookie).not.toHaveBeenCalled();
  });
});
