import { IsIn, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

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

  /**
   * Observação livre. No `create`, `null` e ausente são a mesma coisa (sem nota).
   */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  note?: string | null;
}

/**
 * `null` explícito = **apagar** a observação.
 *
 * Antes o campo era só `@IsOptional() @IsString() @Length(1,255)`: mandar
 * `null` dava 422, mandar `''` dava 422, e o serviço só gravava quando a chave
 * vinha definida. Resultado: uma observação escrita por engano não podia ser
 * removida — a única saída era excluir o item e cadastrá-lo de novo.
 */
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
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(1, 255)
  note?: string | null;
}
