import { IsArray, IsIn, IsObject, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';

export class UpsertAllocationDto {
  /** Quem participa do rateio (ids de usuário). */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  participants: string[];

  @IsOptional()
  @IsIn(['equal', 'proportional'])
  mode?: 'equal' | 'proportional';

  /** Pesos do modo proporcional (percentual ou valor), por id de participante. */
  @IsOptional()
  @IsObject()
  weights?: Record<string, number>;
}

export class SettleAllocationDto {
  @IsString()
  participantId: string;
}
