import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { FinanceProvider, useFinance } from '@/lib/store';

/**
 * O ponto que a auditoria levantou como P0: no modo API a interface precisa
 * gravar no servidor. Se o backend recusar, o estado local não pode mudar e a
 * tela precisa receber a mensagem de erro.
 */

// `vi.mock` é elevado para o topo: nada de variáveis externas dentro da fábrica.
const { apiMock, snapshotMock } = vi.hoisted(() => ({
  apiMock: {
    createTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    createAccount: vi.fn(),
    removeAccount: vi.fn(),
    createCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    deleteBudget: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
  },
  snapshotMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: apiMock };
});

vi.mock('@/lib/api-snapshot', () => ({
  fetchApiSnapshot: () => snapshotMock(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <FinanceProvider>{children}</FinanceProvider>;
}

const apiSnapshot = {
  accounts: [
    {
      id: 'acc-1',
      name: 'Conta corrente',
      institution: 'Banco',
      type: 'checking' as const,
      currency: 'BRL',
      balanceCents: '100000',
      shareLevel: 'private' as const,
      ownerId: 'user-1',
      ownerName: 'Davi',
      color: '#7c5cff',
      isActive: true,
    },
  ],
  categories: [
    { id: 'cat-1', name: 'Mercado', color: '#22cc88', isSystem: false, kind: 'expense' as const },
  ],
  transactions: [],
  budgets: [],
  goals: [],
  partner: null,
  settings: { theme: 'dark' as const, hideValues: false, partnerName: 'Parceiro' },
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  apiMock.createTransaction.mockResolvedValue({ id: 'tx-1' });
  apiMock.deleteTransaction.mockResolvedValue({ deleted: 1 });
  apiMock.createAccount.mockResolvedValue({ id: 'acc-2' });
  apiMock.createCategory.mockResolvedValue({ id: 'cat-2' });
  snapshotMock.mockResolvedValue(apiSnapshot);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderApiSession() {
  const { result } = renderHook(() => useFinance(), { wrapper });
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(async () => {
    await result.current.startApiSession({ id: 'user-1', name: 'Davi', email: 'davi@ex.com' });
  });
  await waitFor(() => expect(result.current.session?.mode).toBe('api'));
  return result;
}

describe('FinanceProvider (modo API)', () => {
  it('grava o lançamento no backend em vez de só no navegador', async () => {
    const result = await renderApiSession();

    let failure: string | null = 'não executou';
    await act(async () => {
      failure = await result.current.addTransaction({
        accountId: 'acc-1',
        categoryId: 'cat-1',
        description: 'Mercado',
        amountCents: '-5000',
        type: 'expense',
        date: '2026-11-25',
      });
    });

    expect(failure).toBeNull();
    expect(apiMock.createTransaction).toHaveBeenCalledWith({
      accountId: 'acc-1',
      categoryId: 'cat-1',
      description: 'Mercado',
      amountCents: '-5000',
      type: 'expense',
      transferAccountId: undefined,
      date: '2026-11-25',
    });
    // O estado local vem do servidor, não de uma aplicação otimista.
    expect(snapshotMock).toHaveBeenCalled();
    expect(window.localStorage.getItem('mf.demo.snapshot.v1')).toBeNull();
  });

  it('envia a conta de destino quando o lançamento é transferência', async () => {
    const result = await renderApiSession();
    await act(async () => {
      await result.current.addTransaction({
        accountId: 'acc-1',
        categoryId: null,
        description: 'Reserva',
        amountCents: '20000',
        type: 'transfer',
        transferAccountId: 'acc-2',
        date: '2026-11-25',
      });
    });

    expect(apiMock.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transfer', transferAccountId: 'acc-2' })
    );
  });

  it('expõe a recusa da API e não inventa estado local', async () => {
    apiMock.createTransaction.mockRejectedValue(new Error('Conta não encontrada'));
    const result = await renderApiSession();
    const antes = result.current.snapshot.transactions.length;

    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.addTransaction({
        accountId: 'acc-x',
        categoryId: null,
        description: 'Fantasma',
        amountCents: '-100',
        type: 'expense',
        date: '2026-11-25',
      });
    });

    expect(failure).toBe('Conta não encontrada');
    expect(result.current.syncError).toBe('Conta não encontrada');
    expect(result.current.snapshot.transactions).toHaveLength(antes);
  });

  it('excluir conta chama a API', async () => {
    const result = await renderApiSession();
    await act(async () => {
      await result.current.deleteAccount('acc-1');
    });
    expect(apiMock.removeAccount).toHaveBeenCalledWith('acc-1');
  });

  it('salvar orçamento usa a API (criando ou atualizando)', async () => {
    const result = await renderApiSession();
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.setBudget({
        categoryId: 'cat-1',
        amountCents: '80000',
        monthKey: '2026-11',
      });
    });

    expect(failure).toBeNull();
    expect(apiMock.createBudget).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      amountCents: '80000',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
    });
  });
});
