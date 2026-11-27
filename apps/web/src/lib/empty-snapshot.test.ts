import { describe, expect, it, vi } from 'vitest';
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

/**
 * Carregamento do snapshot a partir da API.
 *
 * `/auth/status` era pedido **depois** do `Promise.all`, em série: abrir o app
 * pagava duas vezes o tempo de ida e volta até a API. Este teste conta as
 * chamadas e exige uma única rodada concorrente.
 */
describe('fetchApiSnapshot — uma rodada de requisições', () => {
  it('pede status junto com o resto (não em série)', async () => {
    const calls: string[] = [];
    const pending: Array<() => void> = [];
    const wait = () =>
      new Promise<void>((resolve) => {
        pending.push(resolve);
      });

    const apiMock = {
      getAccounts: async () => {
        calls.push('accounts');
        await wait();
        return [];
      },
      getTransactions: async () => {
        calls.push('transactions');
        await wait();
        return [];
      },
      getCategories: async () => {
        calls.push('categories');
        await wait();
        return [];
      },
      getBudgets: async () => {
        calls.push('budgets');
        await wait();
        return [];
      },
      getGoals: async () => {
        calls.push('goals');
        await wait();
        return [];
      },
      getSharing: async () => {
        calls.push('sharing');
        await wait();
        return null;
      },
      getSharedAccounts: async () => {
        calls.push('shared');
        await wait();
        return [];
      },
      getNetWorth: async () => {
        calls.push('networth');
        await wait();
        return null;
      },
      authStatus: async () => {
        calls.push('status');
        await wait();
        return { user: { id: 'u-1', name: 'Davi', email: 'd@ex.com' } };
      },
    };

    vi.doMock('./api', () => ({ api: apiMock }));
    const { fetchApiSnapshot } = await import('./api-snapshot');
    const promise = fetchApiSnapshot();

    // Com todas as requisições concorrentes, as 9 já saíram antes de qualquer
    // resposta: em série, `status` só apareceria depois de liberar as outras 8.
    await Promise.resolve();
    expect(calls).toContain('status');
    expect(calls.filter((name) => name === 'status')).toHaveLength(1);

    pending.forEach((resolve) => resolve());
    await promise;

    vi.doUnmock('./api');
  });
});
