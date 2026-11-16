import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy, type JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * C1 - Bypass de MFA.
 *
 * O token temporario de MFA (5 min) e o token completo (1h) sao assinados com
 * o mesmo segredo e, antes da correcao, tinham o payload identico `{ sub }`.
 * O JwtStrategy aceitava os dois, entao o segundo fator era opcional.
 *
 * A correcao separa os dois por um claim `scope`:
 *   - `scope: 'full'`        -> token definitivo (rotas normais)
 *   - `scope: 'mfa_pending'` -> token temporario (apenas /auth/mfa/verify)
 */
const SECRET = 'a'.repeat(48);

function makeStrategy() {
  return new JwtStrategy({ get: () => SECRET } as never);
}

describe('C1 - separacao entre token temporario de MFA e token completo', () => {
  let jwt: JwtService;
  let authService: AuthService;
  let strategy: JwtStrategy;

  beforeEach(() => {
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
    authService = new AuthService({} as unknown as PrismaService, jwt as never);
    strategy = makeStrategy();
  });

  it('o token temporario de MFA carrega scope "mfa_pending"', () => {
    const token = authService.generateTempToken('user-1');
    const payload = jwt.verify(token, { secret: SECRET }) as JwtPayload;

    expect(payload.scope).toBe('mfa_pending');
    expect(payload.sub).toBe('user-1');
  });

  it('o token completo carrega scope "full"', () => {
    const token = authService.generateToken('user-1');
    const payload = jwt.verify(token, { secret: SECRET }) as JwtPayload;

    expect(payload.scope).toBe('full');
    expect(payload.sub).toBe('user-1');
  });

  it('o JwtStrategy REJEITA o token temporario de MFA', async () => {
    const payload = jwt.verify(authService.generateTempToken('user-1'), {
      secret: SECRET,
    }) as JwtPayload;

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('o JwtStrategy ACEITA o token completo', async () => {
    const payload = jwt.verify(authService.generateToken('user-1'), {
      secret: SECRET,
    }) as JwtPayload;

    await expect(strategy.validate(payload)).resolves.toEqual({ userId: 'user-1' });
  });

  it('um token sem scope (payload legado) tambem e rejeitado', async () => {
    // Token forjado/emitido antes da correcao: payload apenas { sub }.
    const legacyToken = jwt.sign({ sub: 'user-1' });

    const payload = jwt.verify(legacyToken, { secret: SECRET }) as JwtPayload;

    expect(payload.scope).toBeUndefined();
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('o token temporario tem exp de 5 minutos e o completo de 1 hora', () => {
    const temp = jwt.verify(authService.generateTempToken('user-1'), {
      secret: SECRET,
    }) as { exp: number; iat: number };
    const full = jwt.verify(authService.generateToken('user-1'), {
      secret: SECRET,
    }) as { exp: number; iat: number };

    expect(temp.exp - temp.iat).toBe(300);
    expect(full.exp - full.iat).toBe(3600);
  });
});
