import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from '../src/auth/csrf.guard';
import { csrfTokenFor, readCsrfCookie } from '../src/auth/session-cookie';

/**
 * Regressão: escrita autenticada por cookie a partir da web em outro domínio.
 *
 * Cenário do bug relatado ("criar conta" → 403 "token CSRF ausente ou
 * inválido"): o navegador guarda `mf_csrf` no domínio da **API**, então o
 * JavaScript da página web não consegue lê-lo e não monta o header. A API passa
 * a devolver o valor em `/auth/login` e `/auth/status`; esses testes garantem
 * que o guard aceita exatamente esse valor e que ele é derivado do id da
 * sessão (não do JWT), que é o que torna o recálculo possível.
 */
const SESSION_ID = '8d3f0a3e-63a3-4d0b-9a1e-2c0b7e51f3a0';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.assinatura';

function httpContext(options: {
  method?: string;
  cookie?: string;
  header?: string;
  authorization?: string;
}) {
  return {
    // Sem `@SkipCsrf()`: o guard aplica a regra normal de CSRF.
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        method: options.method ?? 'POST',
        headers: {
          cookie: options.cookie,
          'x-csrf-token': options.header,
          authorization: options.authorization,
        },
      }),
    }),
  } as never;
}

describe('CSRF com web e API em domínios diferentes', () => {
  const guard = new CsrfGuard(new Reflector());
  const csrf = csrfTokenFor(SESSION_ID);
  const cookies = `mf_session=${JWT}; mf_csrf=${csrf}`;

  it('o valor devolvido no login/status é aceito como header', () => {
    // É o que a web faz: recebe `csrfToken` no corpo e o envia no header.
    expect(guard.canActivate(httpContext({ cookie: cookies, header: csrf }))).toBe(true);
  });

  it('continua bloqueando quando o header não vem', () => {
    expect(() => guard.canActivate(httpContext({ cookie: cookies }))).toThrow(ForbiddenException);
  });

  it('o CSRF é derivado do id da sessão e estável entre chamadas', () => {
    // `GET /auth/status` recalcula a partir de `sid`: se dependesse do JWT, um
    // refresh do token mudaria o valor e quebraria a escrita no meio da sessão.
    expect(csrfTokenFor(SESSION_ID)).toBe(csrf);
    expect(csrfTokenFor(SESSION_ID)).toBe(csrf);
    expect(csrfTokenFor('outro-sid')).not.toBe(csrf);
  });

  it('o cookie CSRF que a API grava tem o valor que o login devolve', () => {
    const res = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };
    return import('../src/auth/session-cookie').then(({ setSessionCookies }) => {
      setSessionCookies(res, JWT, csrf);
      const [, cookieValue] = res.cookie.mock.calls[1] as [string, string];
      expect(cookieValue).toBe(csrf);
      expect(readCsrfCookie({ headers: { cookie: `mf_csrf=${csrf}` } })).toBe(csrf);
    });
  });

  it('requisição por bearer não precisa de CSRF (mobile)', () => {
    expect(
      guard.canActivate(
        httpContext({ cookie: cookies, authorization: `Bearer ${JWT}`, header: undefined })
      )
    ).toBe(true);
  });
});
