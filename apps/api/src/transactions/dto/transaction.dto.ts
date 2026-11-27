import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

/** Centavos inteiros, negativo para despesa (ex.: "-15000" = -R$ 150,00). */
const CENTS_PATTERN = /^-?\d{1,19}$/;

/** Situações do lançamento: a pagar/receber, liquidado ou anulado. */
export const TRANSACTION_STATUSES = ['pending', 'paid', 'canceled'] as const;

export class CreateTransactionDto {
  @IsString()
  @Length(1, 255)
  accountId: string;

  @IsString()
  @Length(1, 255)
  description: string;

  @IsString()
  @Matches(CENTS_PATTERN, { message: 'amountCents deve ser um inteiro em centavos' })
  amountCents: string;

  @IsIn(['income', 'expense', 'transfer'])
  type: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  categoryId?: string;

  /** Obrigatório quando `type` é `transfer`: conta que recebe o valor. */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  transferAccountId?: string;

  /** Data de caixa: quando o dinheiro entrou/saiu (ou vai entrar/sair). */
  @IsDateString()
  date: string;

  /**
   * Data de competência (mês a que o lançamento pertence). Opcional: sem ela,
   * usa a data de caixa — o caso comum de quem não separa os dois regimes.
   */
  @IsOptional()
  @IsDateString()
  competenceDate?: string;

  /**
   * Situação inicial. `pending` é o padrão de contas a pagar/receber: o
   * lançamento entra na projeção, mas não mexe no saldo até ser liquidado.
   * Transferências são sempre liquidadas na criação.
   */
  @IsOptional()
  @IsIn(TRANSACTION_STATUSES)
  status?: string;

  /** Vencimento (contas a pagar/receber). */
  /**
   * `null` remove o vencimento (lançamento deixa de ser conta a pagar). O
   * service já fazia `new Date(dto.dueDate)` em qualquer valor definido —
   * `new Date(null)` virava 1970 e o vencimento ficava no passado distante.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;
}

export class SettleTransactionDto {
  /** Data da liquidação; padrão é agora. */
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  description?: string;

  @IsOptional()
  @Matches(CENTS_PATTERN, { message: 'amountCents deve ser um inteiro em centavos' })
  amountCents?: string;

  /**
   * `null` limpa a categoria (lançamento passa a "sem categoria"). O service
   * já tratava `dto.categoryId !== undefined` com `?? null`; o DTO recusava o
   * `null` e tornava essa limpeza impossível pela API.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 255)
  categoryId?: string | null;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  competenceDate?: string;

  /**
   * `null` remove o vencimento (lançamento deixa de ser conta a pagar). O
   * service já fazia `new Date(dto.dueDate)` em qualquer valor definido —
   * `new Date(null)` virava 1970 e o vencimento ficava no passado distante.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dueDate?: string | null;
}
