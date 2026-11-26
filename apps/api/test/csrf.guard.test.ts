import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from '../src/auth/csrf.guard';
import { csrfTokenFor, readSessionCookie } from '../src/auth/session-cookie';

/**
 * CSRF para sessão em cookie.
 *
 * O cookie de sessão precisa de `SameSite=None` (web e API em domínios
 * diferentes), então a proteção contra requisição forjada é explícita:
 * header `X-CSRF-Token` igual ao cookie `mf_csrf`. Quem usa bearer não é
 * afetado — nenhum site consegue definir esse header.
 */
const SESSION = 'session-token-abc';
const CSRF = csrfTokenFor(SESSION);

function context(options: {
  method?: string;
  cookie?: string;
  csrfHeader?: string;
  authorization?: string;
}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: options.method ?? 'POST',
        headers: {
          cookie: options.cookie,
          'x-csrf-token': options.csrfHeader,
          authorization: options.authorization,
        },
      }),
    }),
  } as never;
}

const withCookies = `mf_session=${SESSION}; mf_csrf=${CSRF}`;

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('deixa passar requisição sem cookie de sessão', () => {
    expect(guard.canActivate(context({ cookie: undefined }))).toBe(true);
  });

  it('deixa passar quem usa bearer (mobile, integrações)', () => {
    expect(
      guard.canActivate(
        context({ cookie: withCookies, authorization: 'Bearer abc', csrfHeader: undefined })
      )
    ).toBe(true);
  });

  it('aceita escrita com cookie de sessão + header CSRF correspondente', () => {
    expect(guard.canActivate(context({ cookie: withCookies, csrfHeader: CSRF }))).toBe(true);
  });

  it('bloqueia escrita por cookie sem o header CSRF', () => {
    expect(() => guard.canActivate(context({ cookie: withCookies }))).toThrow(ForbiddenException);
  });

  it('bloqueia header CSRF diferente do valor do cookie', () => {
    expect(() =>
      guard.canActivate(context({ cookie: withCookies, csrfHeader: 'valor-forjado' }))
    ).toThrow(ForbiddenException);
  });

  it('não exige CSRF em leitura (GET/HEAD/OPTIONS)', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(guard.canActivate(context({ method, cookie: withCookies }))).toBe(true);
    }
  });

  it('o valor CSRF é estável para a mesma sessão e diferente entre sessões', () => {
    expect(csrfTokenFor(SESSION)).toBe(CSRF);
    expect(csrfTokenFor('outro-token')).not.toBe(CSRF);
  });

  it('lê o cookie de sessão no meio de outros cookies', () => {
    expect(readSessionCookie({ headers: { cookie: `outro=1; mf_session=${SESSION}; x=2` } })).toBe(
      SESSION
    );
    expect(readSessionCookie({ headers: {} })).toBeNull();
  });
});
