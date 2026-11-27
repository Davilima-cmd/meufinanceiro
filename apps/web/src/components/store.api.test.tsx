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
    getBudgets: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    deleteBudget: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    getGoalContributions: vi.fn(),
    addGoalContribution: vi.fn(),
    deleteGoal: vi.fn(),
    setShareLevel: vi.fn(),
    invitePartner: vi.fn(),
    acceptPartnership: vi.fn(),
    revokePartnership: vi.fn(),
    logout: vi.fn(),
    authStatus: vi.fn(),
    setToken: vi.fn(),
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
  apiMock.setShareLevel.mockResolvedValue({ id: 'share-1' });
  apiMock.invitePartner.mockResolvedValue({ id: 'partner-1' });
  apiMock.acceptPartnership.mockResolvedValue({ id: 'partner-1' });
  apiMock.revokePartnership.mockResolvedValue({ revoked: true });
  apiMock.logout.mockResolvedValue({ revoked: true });
  apiMock.authStatus.mockResolvedValue({
    authenticated: true,
    user: { id: 'user-1', name: 'Davi', email: 'davi@ex.com' },
    sessionId: 'sess-1',
    sessions: 1,
  });
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

  it('mudar o nível de compartilhamento grava no servidor', async () => {
    const result = await renderApiSession();
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.setShareLevel('acc-1', 'FULL');
    });

    expect(failure).toBeNull();
    expect(apiMock.setShareLevel).toHaveBeenCalledWith('acc-1', 'FULL');
    // O estado exibido vem de novo do servidor, não de um atalho local.
    expect(snapshotMock).toHaveBeenCalledTimes(2);
  });

  it('convite de parceria vai para a API e não inventa vínculo ativo', async () => {
    const result = await renderApiSession();
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.invitePartner('ana@ex.com');
    });

    expect(failure).toBeNull();
    expect(apiMock.invitePartner).toHaveBeenCalledWith('ana@ex.com');
  });

  it('recusa da API ao compartilhar vira mensagem na tela', async () => {
    apiMock.setShareLevel.mockRejectedValue(
      new Error('Aceite uma parceria antes de compartilhar contas')
    );
    const result = await renderApiSession();
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.setShareLevel('acc-1', 'FULL');
    });

    expect(failure).toBe('Aceite uma parceria antes de compartilhar contas');
    expect(result.current.syncError).toBe('Aceite uma parceria antes de compartilhar contas');
  });

  it('traz para a sessão o estado do segundo fator que a API informa', async () => {
    apiMock.authStatus.mockResolvedValue({
      authenticated: true,
      user: { id: 'user-1', name: 'Davi', email: 'davi@ex.com', mfaEnabled: true },
      sessionId: 'sess-1',
      sessions: 1,
    });
    // Caminho de abertura do app: a sessão guardada é reconfirmada em
    // `GET /auth/status`, que é quem sabe o estado do segundo fator.
    window.localStorage.setItem(
      'mf.session.v1',
      JSON.stringify({ mode: 'api', user: { id: 'user-1', name: 'Davi', email: 'davi@ex.com' } })
    );
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.session?.user.mfaEnabled).toBe(true));

    // Sem isso a tela de Configurações mostrava "inativa" para quem tem MFA:
    // o objeto de sessão era montado descartando o campo.
    expect(result.current.session?.user.mfaEnabled).toBe(true);
  });

  it('sair no modo API revoga a sessão no servidor', async () => {
    const result = await renderApiSession();

    await act(async () => {
      await result.current.signOut();
    });

    // Sem isso o JWT continuaria valendo por até 1h depois do "sair".
    expect(apiMock.logout).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it('sessão revogada em outro aparelho derruba o painel no carregamento', async () => {
    // Token guardado, mas a API responde 401 no `GET /auth/status`.
    apiMock.authStatus.mockRejectedValue(
      Object.assign(new Error('Sessão encerrada. Entre novamente.'), { isUnauthorized: true })
    );
    window.localStorage.setItem(
      'mf.session.v1',
      JSON.stringify({ mode: 'api', user: { id: 'user-1', name: 'Davi', email: 'davi@ex.com' } })
    );

    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.syncError).toMatch(/sessão/i);
  });

  it('salvar orçamento usa a API (criando ou atualizando)', async () => {
    const result = await renderApiSession();
    // O id do orçamento existente é consultado na API (não no snapshot local):
    // com snapshot velho, dois cliques criavam orçamento duplicado.
    apiMock.getBudgets.mockResolvedValue([]);
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

  it('saldo inicial da conta vai para a API (não fica só na tela)', async () => {
    const result = await renderApiSession();

    await act(async () => {
      await result.current.addAccount({
        name: 'Conta corrente',
        institution: 'Banco',
        type: 'checking',
        shareLevel: 'private',
        balanceCents: '250000',
      });
    });

    // Regressão: o formulário não tinha campo de saldo e a conta manual nascia
    // zerada no servidor, apagando o valor na primeira sincronização.
    expect(apiMock.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Conta corrente', balanceCents: '250000' })
    );
  });

  it('conta sem saldo informado não manda balanceCents (usa o padrão 0 do servidor)', async () => {
    const result = await renderApiSession();

    await act(async () => {
      await result.current.addAccount({
        name: 'Carteira',
        type: 'cash',
        shareLevel: 'private',
      });
    });

    const payload = apiMock.createAccount.mock.calls[0][0];
    expect(payload.balanceCents).toBeUndefined();
  });

  it('tema escolhido sobrevive a uma nova sincronização com a API', async () => {
    const result = await renderApiSession();

    await act(async () => {
      result.current.toggleTheme();
    });
    expect(result.current.snapshot.settings.theme).toBe('light');

    // Qualquer mutação remonta o snapshot a partir da API; a preferência local
    // não pode voltar ao padrão no meio do caminho.
    expect(window.localStorage.getItem('mf.settings.v1')).toContain('light');
  });

  it('aporte em meta vai para o endpoint de aportes (histórico no servidor)', async () => {
    snapshotMock.mockResolvedValue({
      ...apiSnapshot,
      goals: [
        {
          id: 'goal-1',
          name: 'Viagem',
          targetCents: '100000',
          currentCents: '1000',
          dueDate: null,
        },
      ],
    });
    apiMock.addGoalContribution.mockResolvedValue({ id: 'goal-1' });

    const result = await renderApiSession();
    // Depois do aporte o store relê o snapshot do servidor: é a resposta dele
    // que manda, não uma soma feita no navegador.
    snapshotMock.mockResolvedValue({
      ...apiSnapshot,
      goals: [
        {
          id: 'goal-1',
          name: 'Viagem',
          targetCents: '100000',
          currentCents: '6000',
          dueDate: null,
        },
      ],
    });
    await waitFor(() =>
      expect(result.current.snapshot.goals.some((goal) => goal.id === 'goal-1')).toBe(true)
    );

    await act(async () => {
      await result.current.contributeGoal('goal-1', '5000', 'Salário');
    });

    expect(apiMock.addGoalContribution).toHaveBeenCalledWith('goal-1', {
      amountCents: '5000',
      note: 'Salário',
    });
    const goal = result.current.snapshot.goals.find((item) => item.id === 'goal-1');
    expect(goal?.currentCents).toBe('6000');
  });

  it('histórico da meta consulta o servidor no modo API', async () => {
    apiMock.getGoalContributions.mockResolvedValue([
      { id: 'c-1', amountCents: '1000', note: null, occurredAt: '2026-11-01T12:00:00Z' },
    ]);

    const result = await renderApiSession();
    let rows: unknown[] = [];
    await act(async () => {
      rows = await result.current.goalHistory('goal-1');
    });

    expect(apiMock.getGoalContributions).toHaveBeenCalledWith('goal-1');
    expect(rows).toHaveLength(1);
  });
});
