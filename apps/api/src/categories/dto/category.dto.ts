import { IsHexColor, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(1, 128)
  name: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsIn(['expense', 'income', 'both'])
  kind?: 'expense' | 'income' | 'both';
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
