import { describe, expect, it, vi } from 'vitest';
import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * Regressão: cookie de sessão órfão sobrevivendo a um `401`.
 *
 * Quem apaga o cookie é o servidor, porque a web não consegue: `mf_session` é
 * `HttpOnly` e vive no domínio da API. Sem esta limpeza, um cookie de sessão
 * que nenhum servidor reconhece (banco resetado, sessão revogada) continuava
 * sendo enviado em toda requisição e derrubava até o cadastro com `403`.
 */
function host() {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const req = { method: 'POST', path: '/api/auth/register' };
  return {
    res,
    host: {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as never,
  };
}

describe('AllExceptionsFilter', () => {
  it('expira os cookies de sessão quando a resposta é 401', () => {
    const { host: h, res } = host();
    const filter = new AllExceptionsFilter({} as never);

    // Evita o log do filtro no output do teste.
    vi.spyOn(
      filter as unknown as { logger: { warn: () => void } },
      'logger',
      'get'
    ).mockReturnValue({
      warn: vi.fn(),
      error: vi.fn(),
    } as never);
    // `super.catch` precisa de um adapter de verdade; aqui só nos interessa o
    // efeito colateral de limpar o cookie, então neutralizamos a resposta.
    vi.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(filter)) as {
        catch: () => void;
      },
      'catch'
    ).mockImplementation(() => undefined);

    filter.catch(new UnauthorizedException('Sessão encerrada'), h);

    const cleared = res.clearCookie.mock.calls.map((call) => (call as [string])[0]);
    expect(cleared).toEqual(['mf_session', 'mf_csrf']);
  });

  it('não mexe em cookies em erro de validação (400)', () => {
    const { host: h, res } = host();
    const filter = new AllExceptionsFilter({} as never);
    vi.spyOn(
      filter as unknown as { logger: { warn: () => void } },
      'logger',
      'get'
    ).mockReturnValue({
      warn: vi.fn(),
      error: vi.fn(),
    } as never);
    vi.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(filter)) as { catch: () => void },
      'catch'
    ).mockImplementation(() => undefined);

    filter.catch(new UnauthorizedException('x'), {
      ...(h as object),
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path: '/api/accounts' }),
        getResponse: () => res,
      }),
    } as never);

    res.clearCookie.mockClear();
    // 400 ≠ 401: nenhum cookie é tocado.
    const badRequest = Object.assign(new Error('inválido'), {
      getStatus: () => HttpStatus.BAD_REQUEST,
    });
    filter.catch(badRequest, h);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
