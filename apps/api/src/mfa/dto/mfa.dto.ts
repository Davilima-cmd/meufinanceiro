import { IsString, Matches } from 'class-validator';

/**
 * Formato exato do que é aceito: segredo TOTP em base32 e código de 6 dígitos.
 *
 * Antes era só `isNotEmpty`: um segredo de 1 MB ia parar no QR code e na
 * criptografia, e o código não validava formato nenhum antes de chegar ao
 * verificador.
 */
const BASE32_SECRET = /^[A-Z2-7]{16,64}$/;
const TOTP_CODE = /^\d{6}$/;

export class EnableMfaDto {
  @IsString()
  @Matches(BASE32_SECRET, { message: 'secret deve ser base32 (A-Z, 2-7), 16 a 64 caracteres' })
  secret: string;

  @IsString()
  @Matches(TOTP_CODE, { message: 'token deve ter 6 dígitos' })
  token: string;
}

export class VerifyMfaDto {
  @IsString()
  @Matches(TOTP_CODE, { message: 'token deve ter 6 dígitos' })
  token: string;
}
