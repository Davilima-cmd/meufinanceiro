import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { CSRF_HEADER, readCsrfCookie, readSessionCookie } from './session-cookie';

/**
 * Proteção CSRF para requisições autenticadas por cookie.
 *
 * Regra: **só** quem se autentica por cookie é obrigado a provar que sabe o
 * segredo CSRF (header `X-CSRF-Token` igual ao cookie `mf_csrf`). Requisições
 * com `Authorization: Bearer` são imunes por definição — um site de terceiro
 * não consegue definir esse header, e o token não vai junto automaticamente.
 *
 * Métodos seguros (`GET`/`HEAD`/`OPTIONS`) passam: não mudam estado.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      headers: { authorization?: string; cookie?: string; 'x-csrf-token'?: string | string[] };
    }>();

    if (!readSessionCookie(request)) return true;
    if (request.headers.authorization) return true;

    const method = (request.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const cookieValue = readCsrfCookie(request);
    const headerValue = request.headers[CSRF_HEADER];
    const sent = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!cookieValue || !sent || !constantTimeEquals(cookieValue, sent)) {
      throw new ForbiddenException('Requisição bloqueada: token CSRF ausente ou inválido.');
    }

    return true;
  }
}

/** Comparação em tempo constante (evita vazar o valor byte a byte). */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
