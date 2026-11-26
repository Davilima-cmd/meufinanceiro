import { IsDateString, IsOptional, IsString, Length, Matches } from 'class-validator';

const CENTS_PATTERN = /^-?\d{1,19}$/;

export class CreateBudgetDto {
  @IsString()
  @Length(1, 255)
  categoryId: string;

  /** Centavos inteiros em string (ex.: "60000" = R$ 600,00). */
  @IsString()
  @Matches(CENTS_PATTERN, { message: 'amountCents deve ser um inteiro em centavos' })
  amountCents: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}

export class UpdateBudgetDto {
  @IsOptional()
  @IsString()
  @Matches(CENTS_PATTERN, { message: 'amountCents deve ser um inteiro em centavos' })
  amountCents?: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
