import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from '../src/auth/csrf.guard';
import { AuthController } from '../src/auth/auth.controller';
import { MfaController } from '../src/mfa/mfa.controller';
import { SkipCsrf, SKIP_CSRF } from '../src/common/skip-csrf.decorator';

/**
 * Regressão: cadastro bloqueado com 403 por causa de cookie de sessão órfão.
 *
 * Sequência real que produziu o bug: o banco foi resetado (sessões apagadas),
 * o navegador manteve o cookie `mf_session` antigo — `HttpOnly`, de outro
 * domínio, impossível de apagar pelo JavaScript da página — e a chamada
 * `POST /auth/register` chegou com esse cookie. O `CsrfGuard`, que roda global,
 * exigiu o header CSRF e respondeu `403` **antes de qualquer lógica de
 * cadastro**. Cadastro não depende de sessão: não pode ser barrado por ela.
 */
const SESSION = 'sessao-orfa';
const COOKIE = `mf_session=${SESSION}`;

function ctx(
  handler: (...args: never[]) => unknown,
  controller: new (...args: never[]) => unknown
) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', headers: { cookie: COOKIE } }),
    }),
  } as never;
}

const guard = new CsrfGuard(new Reflector());

describe('CsrfGuard em rotas públicas', () => {
  it('não bloqueia POST /auth/register com cookie órfão', () => {
    const allowed = guard.canActivate(
      ctx(AuthController.prototype.register, AuthController) as never
    );
    expect(allowed).toBe(true);
  });

  it('não bloqueia login, recuperação e redefinição de senha', () => {
    for (const handler of [
      AuthController.prototype.login,
      AuthController.prototype.forgotPassword,
      AuthController.prototype.resetPassword,
      MfaController.prototype.verify,
    ]) {
      const controller =
        handler === MfaController.prototype.verify ? MfaController : AuthController;
      expect(guard.canActivate(ctx(handler as never, controller) as never)).toBe(true);
    }
  });

  it('continua exigindo CSRF nas rotas autenticadas por cookie', () => {
    // Um handler qualquer, sem o marcador: a regra normal se aplica.
    class Protected {
      write() {
        return null;
      }
    }
    const run = () => guard.canActivate(ctx(Protected.prototype.write, Protected) as never);
    expect(run).toThrow(ForbiddenException);
  });

  it('o decorador marca exatamente as rotas esperadas', () => {
    const reflector = new Reflector();
    const marked = (handler: unknown, controller: unknown) =>
      reflector.getAllAndOverride<boolean>(SKIP_CSRF, [handler as never, controller as never]);

    expect(marked(AuthController.prototype.register, AuthController)).toBe(true);
    expect(marked(AuthController.prototype.login, AuthController)).toBe(true);
    expect(marked(AuthController.prototype.logout, AuthController)).toBeUndefined();
    expect(marked(AuthController.prototype.logoutAll, AuthController)).toBeUndefined();
  });

  it('SkipCsrf exporta a metadata usada pelo guard', () => {
    class Sample {
      @SkipCsrf()
      run() {
        return null;
      }
    }
    expect(new Reflector().get(SKIP_CSRF, Sample.prototype.run)).toBe(true);
  });
});
