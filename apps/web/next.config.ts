import type { NextConfig } from 'next';

/**
 * API que o navegador pode chamar. Sai de `NEXT_PUBLIC_API_BASE` (ex.:
 * https://meufinanceiro-api-xxx.vercel.app/api) e entra na CSP como origem
 * permitida — sem isso o `connect-src` bloquearia as chamadas do app.
 */
const apiOrigin = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) return '';
  try {
    return new URL(base).origin;
  } catch {
    return '';
  }
})();

/**
 * Content-Security-Policy.
 *
 * `script-src 'unsafe-inline'` é necessário porque o Next injeta o script de
 * boot inline e o widget do Open Finance (CDN do provedor) precisa carregar.
 * Ainda assim a política barra o vetor mais comum de exfiltração de token:
 * `connect-src` limitado à nossa API, `frame-ancestors 'none'` (clickjacking) e
 * `form-action 'self'`.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.pluggy.ai",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''} https://api.pluggy.ai`,
  // O widget abre em iframe do provedor; nada além dele pode enquadrar o app.
  "frame-src 'self' https://cdn.pluggy.ai https://connect.pluggy.ai",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Pacotes do monorepo são consumidos a partir do código-fonte (TS/ESM).
  transpilePackages: ['@meufinanceiro/shared-types', '@meufinanceiro/design-tokens'],
  // Nenhuma variável pública é obrigatória: sem NEXT_PUBLIC_API_BASE o app roda
  // em modo demonstração e só usa a API quando o usuário escolhe "Tenho conta".
  poweredByHeader: false,
  // Hosts usados pelos previews de desenvolvimento (sandbox do Arena e afins).
  // Em produção o app é servido pelo domínio da Vercel e esta lista não é usada.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    ...(process.env.ALLOWED_DEV_ORIGINS?.split(',') ?? []),
  ],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
