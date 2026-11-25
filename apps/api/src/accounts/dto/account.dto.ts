import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export const ACCOUNT_TYPES = [
  'manual',
  'checking',
  'savings',
  'wallet',
  'investment',
  'credit',
] as const;

/** Centavos em texto (nunca ponto flutuante). Aceita sinal negativo. */
const CENTS = /^-?\d{1,19}$/;

export class CreateAccountDto {
  @IsString()
  @Length(1, 128)
  name: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  institution?: string;

  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /**
   * Saldo inicial informado na criação. É gravado como o primeiro movimento
   * (uma transação de ajuste), para que o saldo continue sendo derivado do
   * histórico em vez de ser um número editável.
   */
  @IsOptional()
  @Matches(CENTS, { message: 'balanceCents deve ser inteiro em centavos' })
  balanceCents?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  institution?: string;

  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: string;

  /** Arquivar a conta mantém o histórico; desativar não apaga lançamentos. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
