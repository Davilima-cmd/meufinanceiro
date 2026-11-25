import { IsDateString, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

/** Centavos inteiros, negativo para despesa (ex.: "-15000" = -R$ 150,00). */
const CENTS_PATTERN = /^-?\d{1,19}$/;

export class CreateTransactionDto {
  @IsString()
  accountId: string;

  @IsString()
  @Length(1, 255)
  description: string;

  @IsString()
  @Matches(CENTS_PATTERN, { message: 'amountCents deve ser um inteiro em centavos' })
  amountCents: string;

  @IsIn(['income', 'expense', 'transfer'])
  type: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsDateString()
  date: string;
}
