/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@meufinanceiro/shared-types',
    '@meufinanceiro/validation',
    '@meufinanceiro/design-tokens',
    '@meufinanceiro/money',
  ],
};

module.exports = nextConfig;
