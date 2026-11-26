import { IsEmail, IsIn, IsString } from 'class-validator';
import { SHARE_LEVELS } from '../../common/account-access';

export class InvitePartnerDto {
  /** E-mail da pessoa que já tem conta no app. */
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;
}

export class SetShareLevelDto {
  @IsString()
  @IsIn(SHARE_LEVELS, { message: 'Nível deve ser private, BALANCE_ONLY ou FULL.' })
  level: string;
}
