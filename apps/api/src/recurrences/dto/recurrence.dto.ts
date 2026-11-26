import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import type { DecimalLike } from '../../common/money';

export const RECURRENCE_TYPES = ['income', 'expense'] as const;
const CENTS = /^-?\d{1,19}$/;

export class CreateRecurrenceDto {
  @IsString()
  @Length(1, 255)
  accountId: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  categoryId?: string;

  @IsString()
  @Length(1, 128)
  description: string;

  @Matches(CENTS, { message: 'amountCents deve ser inteiro em centavos' })
  amountCents: string;

  @IsIn(RECURRENCE_TYPES)
  type: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsString()
  startAt?: string;
}

export class SetRecurrenceActiveDto {
  @IsBoolean()
  active: boolean;
}

/** Só para o tipo: o serviço recebe o valor já convertido em string. */
export type RecurrenceAmount = DecimalLike;
