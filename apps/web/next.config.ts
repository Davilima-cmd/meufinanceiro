import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Pacotes do monorepo são consumidos a partir do código-fonte (TS/ESM).
  transpilePackages: ['@meufinanceiro/shared-types', '@meufinanceiro/design-tokens'],
  // Nenhuma variável pública é obrigatória: sem NEXT_PUBLIC_API_BASE o app roda
  // em modo demonstração e só usa a API quando o usuário escolhe "Tenho conta".
  poweredByHeader: false,
};

export default nextConfig;
