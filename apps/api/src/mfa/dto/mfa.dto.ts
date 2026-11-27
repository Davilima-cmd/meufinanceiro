import { IsString, Matches } from 'class-validator';

/**
 * Formato exato do que é aceito.
 *
 * O segredo TOTP **nunca** vem do cliente: ele nasce no servidor em
 * `GET /auth/mfa/secret`. Aqui só circula o código de 6 dígitos, com formato
 * validado antes de chegar ao verificador.
 */
const TOTP_CODE = /^\d{6}$/;

/** Habilita o MFA confirmando o primeiro código do segredo pendente. */
export class EnableMfaDto {
  @IsString()
  @Matches(TOTP_CODE, { message: 'token deve ter 6 dígitos' })
  token: string;
}

/** Confirma um código do app autenticador (login MFA e desligamento). */
export class VerifyMfaDto {
  @IsString()
  @Matches(TOTP_CODE, { message: 'token deve ter 6 dígitos' })
  token: string;
}
