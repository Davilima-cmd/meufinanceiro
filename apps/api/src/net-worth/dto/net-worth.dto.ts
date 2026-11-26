import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export const NET_WORTH_KINDS = ['asset', 'liability'] as const;

export class CreateNetWorthItemDto {
  @IsString()
  @Length(1, 128)
  name: string;

  @IsIn(NET_WORTH_KINDS)
  kind: string;

  /** Valor sempre positivo, em centavos: o sinal vem do `kind`. */
  @Matches(/^\d{1,19}$/, { message: 'valueCents deve ser um inteiro positivo em centavos' })
  valueCents: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  note?: string;
}

export class UpdateNetWorthItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsIn(NET_WORTH_KINDS)
  kind?: string;

  @IsOptional()
  @Matches(/^\d{1,19}$/, { message: 'valueCents deve ser um inteiro positivo em centavos' })
  valueCents?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  note?: string;
}
