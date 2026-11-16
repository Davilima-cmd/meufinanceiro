/**
 * Resolução e validação do segredo de assinatura do JWT.
 *
 * Em desenvolvimento aceitamos o valor de exemplo para não travar o setup
 * local. Em produção o segredo é obrigatório e precisa ter no mínimo 32
 * caracteres — um segredo curto ou previsível permite forjar tokens.
 */
const DEV_FALLBACK = 'dev-secret-change-me';
const MIN_SECRET_LENGTH = 32;

export function resolveJwtSecret(configured?: string): string {
  const secret = configured?.trim();

  if (!secret || secret === DEV_FALLBACK) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET é obrigatória em produção. Gere uma com: openssl rand -base64 48'
      );
    }
    return DEV_FALLBACK;
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres (tem ${secret.length}).`
    );
  }

  return secret;
}
