import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionService, hashToken } from '../src/auth/session.service';
import { clearSessionCookies, csrfTokenFor, setSessionCookies } from '../src/auth/session-cookie';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sessões revogáveis.
 *
 * O ponto central: um JWT válido não basta. Se a linha em `sessions` sumiu
 * (logout, troca de senha, exclusão da conta), a requisição é recusada — em vez
 * de o token continuar valendo por uma hora inteira.
 */
const SECRET = 'b'.repeat(48);

function makePrisma(rows = new Map<string, { userId: string; expiresAt: Date }>()) {
  return {
    rows,
    session: {
      create: vi.fn(async ({ data }: { data: { id: string; userId: string; expiresAt: Date } }) => {
        rows.set(data.id, { userId: data.userId, expiresAt: data.expiresAt });
        return { id: data.id };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      deleteMany: vi.fn(async () => ({ count: rows.size })),
      findMany: vi.fn(async () => [...rows.entries()].map(([id, row]) => ({ id, ...row }))),
    },
  };
}

function setup() {
  const prisma = makePrisma();
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
  const sessions = new SessionService(prisma as unknown as PrismaService, jwt);
  return { prisma, jwt, sessions };
}

describe('SessionService', () => {
  it('cria a sessão e devolve um token com o id dela', async () => {
    const { sessions, jwt } = setup();

    const { token, sessionId } = await sessions.create('user-1');
    const payload = jwt.verify(token, { secret: SECRET }) as { sub: string; sid: string };

    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe(sessionId);
  });

  it('guarda apenas o hash do token, nunca o token', async () => {
    const { sessions, prisma } = setup();

    const { token, sessionId } = await sessions.create('user-1');
    const stored = (prisma.session.create.mock.calls[0] as unknown[])[0] as {
      data: { tokenHash: string };
    };

    expect(stored.data.tokenHash).toBe(hashToken(token));
    expect(stored.data.tokenHash).not.toBe(token);
    expect(sessionId).toBeTruthy();
  });

  it('sessão ativa passa na validação', async () => {
    const { sessions } = setup();
    const { sessionId } = await sessions.create('user-1');

    await expect(sessions.assertActive(sessionId, 'user-1')).resolves.toBeUndefined();
  });

  it('sessão revogada (linha apagada) é recusada', async () => {
    const { sessions, prisma } = setup();
    const { sessionId } = await sessions.create('user-1');
    prisma.rows.delete(sessionId);

    await expect(sessions.assertActive(sessionId, 'user-1')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('sessão de outro usuário é recusada', async () => {
    const { sessions } = setup();
    const { sessionId } = await sessions.create('user-1');

    await expect(sessions.assertActive(sessionId, 'user-2')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('sessão expirada é recusada mesmo existindo', async () => {
    const { sessions, prisma } = setup();
    const { sessionId } = await sessions.create('user-1');
    const row = prisma.rows.get(sessionId);
    if (row) row.expiresAt = new Date(Date.now() - 1000);

    await expect(sessions.assertActive(sessionId, 'user-1')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('token sem sessão (sem `sid`) é recusado', async () => {
    const { sessions } = setup();

    await expect(sessions.assertActive(undefined, 'user-1')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('revogar apaga só a sessão do usuário informado', async () => {
    const { sessions, prisma } = setup();
    const { sessionId } = await sessions.create('user-1');

    await sessions.revoke(sessionId, 'user-1');

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: sessionId, userId: 'user-1' },
    });
  });
});

describe('cookies de sessão', () => {
  function fakeResponse() {
    return {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };
  }

  it('o cookie de sessão é HttpOnly, Secure e SameSite=None em produção', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = fakeResponse();
      setSessionCookies(res, 'token-abc', csrfTokenFor('token-abc'));

      const [name, , options] = res.cookie.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(name).toBe('mf_session');
      expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none' });

      const [csrfName, , csrfOptions] = res.cookie.mock.calls[1] as [
        string,
        string,
        Record<string, unknown>,
      ];
      // O cookie que o JS precisa ler NÃO pode ser HttpOnly.
      expect(csrfName).toBe('mf_csrf');
      expect(csrfOptions).toMatchObject({ httpOnly: false, secure: true, sameSite: 'none' });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('limpar a sessão apaga os dois cookies', () => {
    const res = fakeResponse();
    clearSessionCookies(res);

    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });
});
