import { IsIn, IsString, Length, Matches } from 'class-validator';

/**
 * Corpo de `POST /open-finance/connections` (vínculo manual de conta).
 *
 * Antes era um tipo inline sem validação: `provider`, `providerAccountId` e
 * `accountId` chegavam como qualquer valor e iam direto para o banco, com o
 * tamanho que o cliente quisesse. `accountId` continua sendo conferido como
 * "conta do usuário autenticado" no controller — a validação aqui é sobre a
 * forma, não sobre a autorização.
 */
export class ConnectConnectionDto {
  @IsString()
  @IsIn(['pluggy', 'manual'])
  provider!: string;

  // Id opaco do provedor: só caracteres seguros e tamanho de id, nunca HTML
  // ou caminho de arquivo.
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'providerAccountId deve conter apenas letras, números, "-" e "_"',
  })
  providerAccountId!: string;

  @IsString()
  @Length(1, 64)
  accountId!: string;
}
