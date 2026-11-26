import { describe, expect, it } from 'vitest';
import { buildDemoSnapshot, buildEmptySnapshot } from './demo-data';

/**
 * Regressão: conta real mostrando dados de demonstração.
 *
 * O `FinanceProvider` começa com `buildDemoSnapshot()` para ter HTML inicial
 * determinístico (servidor e cliente iguais). Ao entrar na conta real, esse
 * snapshot continuava na tela enquanto a API carregava — e permanecia para
 * sempre se `fetchApiSnapshot` falhasse. O usuário via "Olá, Davi! R$ 34.776,00
 * · Ana Souza também usa este painel" numa conta que ele tinha acabado de criar
 * e que estava vazia no banco.
 */
describe('buildEmptySnapshot', () => {
  const empty = buildEmptySnapshot();

  it('não tem nenhuma conta, lançamento, meta, orçamento ou parceiro', () => {
    expect(empty.accounts).toEqual([]);
    expect(empty.transactions).toEqual([]);
    expect(empty.goals).toEqual([]);
    expect(empty.budgets).toEqual([]);
    expect(empty.netWorthItems).toEqual([]);
    expect(empty.partner).toBeNull();
    expect(empty.invites).toEqual([]);
  });

  it('não carrega valores, nomes ou pessoa fictícia do demo', () => {
    const serialized = JSON.stringify(empty);
    expect(serialized).not.toContain('Ana Souza');
    expect(serialized).not.toContain('@demonstracao.app');
    expect(serialized).not.toContain('34.776');
    // Nenhum saldo: zero contas significa zero centavos em qualquer campo.
    expect(serialized).not.toMatch(/balanceCents/);
  });

  it('mantém as categorias do sistema (vocabulário real, igual ao seed)', () => {
    expect(empty.categories).toHaveLength(8);
    expect(empty.categories.every((category) => category.isSystem)).toBe(true);
    expect(empty.categories.map((category) => category.name)).toContain('Alimentação');
  });

  it('o snapshot de demonstração segue intacto para o modo demo', () => {
    // A correção não pode ter esvaziado o modo demonstração.
    const demo = buildDemoSnapshot();
    expect(demo.accounts.length).toBeGreaterThan(0);
    expect(demo.transactions.length).toBeGreaterThan(0);
    expect(demo.partner?.name).toBe('Ana Souza');
  });
});
