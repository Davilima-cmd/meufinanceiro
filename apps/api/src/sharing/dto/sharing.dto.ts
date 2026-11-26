import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { SHARE_LEVELS } from '../../common/account-access';

export class InvitePartnerDto {
  /** E-mail da pessoa que já tem conta no app. */
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;
}

export class AcceptPartnershipDto {
  /** Aceitar um convite específico; sem ele, aceita o mais recente. */
  @IsOptional()
  @IsString()
  partnershipId?: string;
}

export class SetShareLevelDto {
  @IsString()
  @IsIn(SHARE_LEVELS, { message: 'Nível deve ser private, BALANCE_ONLY ou FULL.' })
  level: string;
}
