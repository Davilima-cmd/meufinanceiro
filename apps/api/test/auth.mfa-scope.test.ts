import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy, type JwtPayload } from '../src/auth/jwt.strategy';
import { SessionService } from '../src/auth/session.service';
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
 *
 * Depois disso, o token `full` passou a carregar tambem `sid` (id da sessao em
 * `sessions`), para que o logout invalide o JWT de verdade.
 */
const SECRET = 'a'.repeat(48);

/** Prisma de mentira: guarda as sessoes criadas em memoria. */
function makePrisma() {
  const rows = new Map<string, { userId: string; expiresAt: Date; tokenHash: string }>();
  return {
    rows,
    session: {
      create: async ({
        data,
      }: {
        data: { id: string; userId: string; expiresAt: Date; tokenHash: string };
      }) => {
        rows.set(data.id, data);
        return { id: data.id };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        return row ? { userId: row.userId, expiresAt: row.expiresAt } : null;
      },
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
    },
  };
}

function makeStrategy(sessions: SessionService) {
  return new JwtStrategy({ get: () => SECRET } as never, sessions);
}

describe('C1 - separacao entre token temporario de MFA e token completo', () => {
  let jwt: JwtService;
  let authService: AuthService;
  let sessions: SessionService;
  let strategy: JwtStrategy;

  beforeEach(() => {
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
    const prisma = makePrisma();
    sessions = new SessionService(prisma as unknown as PrismaService, jwt);
    authService = new AuthService({} as unknown as PrismaService, jwt as never);
    strategy = makeStrategy(sessions);
  });

  it('o token temporario de MFA carrega scope "mfa_pending"', () => {
    const token = authService.generateTempToken('user-1');
    const payload = jwt.verify(token, { secret: SECRET }) as JwtPayload;

    expect(payload.scope).toBe('mfa_pending');
    expect(payload.sub).toBe('user-1');
  });

  it('o token completo carrega scope "full" e o id da sessao', async () => {
    const { token, sessionId } = await sessions.create('user-1');
    const payload = jwt.verify(token, { secret: SECRET }) as JwtPayload;

    expect(payload.scope).toBe('full');
    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe(sessionId);
  });

  it('o JwtStrategy REJEITA o token temporario de MFA', async () => {
    const payload = jwt.verify(authService.generateTempToken('user-1'), {
      secret: SECRET,
    }) as JwtPayload;

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('o JwtStrategy ACEITA o token completo', async () => {
    const { token, sessionId } = await sessions.create('user-1');
    const payload = jwt.verify(token, { secret: SECRET }) as JwtPayload;

    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 'user-1',
      sessionId,
    });
  });

  it('um token sem scope (payload legado) tambem e rejeitado', async () => {
    // Token forjado/emitido antes da correcao: payload apenas { sub }.
    const legacyToken = jwt.sign({ sub: 'user-1' });

    const payload = jwt.verify(legacyToken, { secret: SECRET }) as JwtPayload;

    expect(payload.scope).toBeUndefined();
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('um token completo sem sessao gravada e rejeitado', async () => {
    // Token válido na assinatura, mas a sessão não existe (logout/troca de senha).
    const orphan = jwt.sign({ sub: 'user-1', scope: 'full', sid: 'sessao-que-nao-existe' });
    const payload = jwt.verify(orphan, { secret: SECRET }) as JwtPayload;

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('o token temporario tem exp de 5 minutos e o completo de 1 hora', async () => {
    const temp = jwt.verify(authService.generateTempToken('user-1'), {
      secret: SECRET,
    }) as { exp: number; iat: number };
    const { token: fullToken } = await sessions.create('user-1');
    const full = jwt.verify(fullToken, { secret: SECRET }) as { exp: number; iat: number };

    expect(temp.exp - temp.iat).toBe(300);
    expect(full.exp - full.iat).toBe(3600);
  });
});
