import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

/** Um rateio entre mais de 50 pessoas não é um rateio, é abuso de payload. */
const MAX_PARTICIPANTS = 50;

export class UpsertAllocationDto {
  /** Quem participa do rateio (ids de usuário). */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PARTICIPANTS)
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  participants: string[];

  @IsOptional()
  @IsIn(['equal', 'proportional'])
  mode?: 'equal' | 'proportional';

  /**
   * Pesos do modo proporcional (percentual ou valor), por id de participante.
   *
   * `IsNumber` com `allowNaN: false` + teto por valor: sem validação de tipo o
   * corpo podia mandar string, array ou `1e308` e o cálculo de rateio recebia
   * lixo (o teto fino fica no `splitAmount`, que é quem escala os BigInts).
   */
  @IsOptional()
  @IsObject()
  weights?: Record<string, number>;
}

export class SettleAllocationDto {
  @IsString()
  @Length(1, 255)
  participantId: string;
}
