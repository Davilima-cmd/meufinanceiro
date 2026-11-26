import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

/** Limite superior: argon2 processa o input inteiro, senhas gigantes viram DoS. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Limite do e-mail: RFC 5321 aceita 254; acima disso é payload, não cadastro. */
const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 120;

export class RegisterDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  @IsString()
  @Length(1, NAME_MAX_LENGTH)
  name: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  // Mesmo limite do cadastro: sem teto, uma senha de 1 MB faz o argon2
  // processar 1 MB por tentativa (custo de CPU de graça para o atacante).
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

/**
 * Confirmação para ação irreversível.
 *
 * Excluir a conta apaga tudo (contas, lançamentos, histórico). Um `DELETE`
 * autenticado só pelo cookie não prova que é o dono naquele momento — um
 * navegador emprestado, uma sessão aberta numa máquina compartilhada ou um CSRF
 * bem-sucedido não podem destruir o histórico financeiro. A senha é conferida
 * de novo, com custo de argon2, no servidor.
 */
export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
