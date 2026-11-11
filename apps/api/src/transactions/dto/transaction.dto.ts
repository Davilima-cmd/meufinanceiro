import { IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
  @IsString()
  accountId: string;

  @IsString()
  description: string;

  @IsString()
  amountCents: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  date: string;
}
