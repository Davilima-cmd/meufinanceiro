import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class EnableMfaDto {
  @IsString()
  @IsNotEmpty()
  secret: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}

export class VerifyMfaDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
