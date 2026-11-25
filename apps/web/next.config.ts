import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Pacotes do monorepo são consumidos a partir do código-fonte (TS/ESM).
  transpilePackages: ['@meufinanceiro/shared-types', '@meufinanceiro/design-tokens'],
  // Nenhuma variável pública é obrigatória: sem NEXT_PUBLIC_API_BASE o app roda
  // em modo demonstração e só usa a API quando o usuário escolhe "Tenho conta".
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
