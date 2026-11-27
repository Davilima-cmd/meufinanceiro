import { IsDateString, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

const CENTS_PATTERN = /^\d{1,19}$/;

export class CreateGoalDto {
  @IsString()
  @Length(1, 255)
  name: string;

  /** Valor alvo em centavos inteiros (ex.: "900000" = R$ 9.000,00). */
  @IsString()
  @Matches(CENTS_PATTERN, { message: 'targetCents deve ser um inteiro em centavos' })
  targetCents: string;

  @IsOptional()
  @IsString()
  @Matches(CENTS_PATTERN, { message: 'currentCents deve ser um inteiro em centavos' })
  currentCents?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(CENTS_PATTERN)
  targetCents?: string;

  @IsOptional()
  @IsString()
  @Matches(CENTS_PATTERN)
  currentCents?: string;

  /** `null` remove o prazo da meta (o service já tratava o valor definido). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;
}

/** Aporte em uma meta: valor positivo entra, negativo resgata. */
export class GoalContributionDto {
  @IsString()
  @Matches(/^-?\d{1,19}$/, { message: 'amountCents deve ser um inteiro em centavos' })
  amountCents: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  note?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
