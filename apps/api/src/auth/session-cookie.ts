/**
 * Formatos mínimos que usamos de `req`/`res`. Declará-los aqui evita depender
 * dos tipos do Express (o pacote não é dependência direta do api).
 */
import { createHash } from 'node:crypto';

type CookieRequest = { headers?: { cookie?: string } };
type CookieResponse = {
  cookie(name: string, value: string, options?: Record<string, unknown>): unknown;
  clearCookie?: (name: string, options?: Record<string, unknown>) => unknown;
};

/**
 * Sessão em cookie `HttpOnly` para a web.
 *
 * O JWT em `localStorage` é legível por qualquer script injetado (XSS) e vira
 * um alvo fácil. Aqui o token vai num cookie que o JavaScript não enxerga.
 *
 * Como a web e a API ficam em domínios diferentes (Vercel), o cookie precisa de
 * `SameSite=None; Secure` para ser enviado nas chamadas `fetch` com
 * `credentials: 'include'`. Isso remove a proteção natural do `SameSite`
 * contra CSRF, então ela é devolvida explicitamente com **double submit**:
 * um segundo cookie (`mf_csrf`, legível) guarda um valor aleatório que o
 * cliente copia para o header `X-CSRF-Token`. Um site de terceiro consegue
 * enviar o cookie de sessão, mas não consegue ler o valor para montar o header.
 *
 * O bearer token continua funcionando (app mobile, integrações): o cookie é
 * uma alternativa, não uma substituição.
 */
export const SESSION_COOKIE = 'mf_session';
export const CSRF_COOKIE = 'mf_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Cookie de sessão: dura tanto quanto o JWT (1h por padrão). */
const SESSION_MAX_AGE_SECONDS = Number(process.env.SESSION_COOKIE_MAX_AGE ?? 60 * 60);

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    // Em produção web e API são domínios distintos: `None` + `Secure` é a única
    // combinação aceita pelo navegador nesse cenário.
    sameSite: (isProduction() ? 'none' : 'lax') as 'none' | 'lax',
    secure: isProduction(),
    path: '/',
  };
}

/**
 * Valor CSRF derivado do próprio token (HMAC com o segredo do JWT não é
 * necessário: o token já é imprevisível e fica só do lado do servidor).
 *
 * Derivar em vez de sortear mantém o par cookie/header estável entre o login e
 * o refresh da página sem precisar de estado extra no servidor.
 */
export function csrfTokenFor(sessionToken: string): string {
  return createHash('sha256').update(`csrf:${sessionToken}`).digest('hex').slice(0, 32);
}

export function setSessionCookies(res: CookieResponse, token: string, csrfToken: string): void {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(true),
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...cookieOptions(false),
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  });
}

export function clearSessionCookies(res: CookieResponse): void {
  res.clearCookie?.(SESSION_COOKIE, cookieOptions(true));
  res.clearCookie?.(CSRF_COOKIE, cookieOptions(false));
}

/** Lê um cookie do header, sem depender de `cookie-parser`. */
export function readCookie(req: CookieRequest, name: string): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export function readSessionCookie(req: CookieRequest): string | null {
  return readCookie(req, SESSION_COOKIE);
}

export function readCsrfCookie(req: CookieRequest): string | null {
  return readCookie(req, CSRF_COOKIE);
}
