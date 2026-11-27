'use client'; /* eslint-disable react-hooks/set-state-in-effect -- hidratação/redirecionamento exclusivo do cliente (localStorage/sessionStorage) */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ApiGoalContribution } from '@meufinanceiro/shared-types';
import { buildDemoSnapshot, buildEmptySnapshot, DEMO_USER } from './demo-data';
import { fetchApiSnapshot } from './api-snapshot';
import { api } from './api';
import type {
  ShareLevel,
  FinanceAccount,
  FinanceCategory,
  FinanceGoal,
  NetWorthItemKind,
  FinanceSnapshot,
  FinanceTransaction,
  FinanceUser,
  NewAccount,
  NewTransaction,
  SessionMode,
} from './types';
import { monthBounds, todayISO } from './format';

const DEMO_SNAPSHOT_KEY = 'mf.demo.snapshot.v1';
const SESSION_KEY = 'mf.session.v1';
/** Preferências de exibição (tema/valores ocultos) — sobrevivem a recarregar. */
const SETTINGS_KEY = 'mf.settings.v1';

export type Session = { mode: SessionMode; user: FinanceUser };

type FinanceContextValue = {
  session: Session | null;
  snapshot: FinanceSnapshot;
  hydrated: boolean;
  syncing: boolean;
  syncError: string | null;
  isDemo: boolean;
  startDemo: () => void;
  startApiSession: (user: FinanceUser) => Promise<void>;
  signOut: () => Promise<void>;
  resetDemo: () => void;
  refresh: () => Promise<void>;
  /**
   * Mutações devolvem o erro quando a API rejeita a operação. No modo
   * demonstração resolvem com `null` (tudo é local).
   */
  addTransaction: (input: NewTransaction) => Promise<string | null>;
  settleTransaction: (id: string, paidAt?: string) => Promise<string | null>;
  cancelTransaction: (id: string) => Promise<string | null>;
  deleteTransaction: (id: string) => Promise<string | null>;
  addAccount: (input: NewAccount) => Promise<string | null>;
  /**
   * Vincula uma conta bancária pelo Open Finance: a conta é criada a partir do
   * que a instituição informa (nome, tipo, saldo), não digitada no app.
   */
  linkBankAccount: (input: {
    provider: string;
    providerAccountId: string;
  }) => Promise<string | null>;
  /**
   * Abre o fluxo de consentimento do Open Finance e importa as contas do banco.
   *
   * `openWidget` recebe o token do widget e devolve o `itemId` criado (ou
   * `null` se o usuário fechar). A UI é quem monta o widget; o store só cuida
   * de pedir o token, registrar o item e recarregar o snapshot.
   */
  connectBank: (
    openWidget: (connectToken: string) => Promise<string | null>
  ) => Promise<string | null>;
  deleteAccount: (id: string) => Promise<string | null>;
  addCategory: (input: {
    name: string;
    color: string;
    kind: FinanceCategory['kind'];
  }) => Promise<string | null>;
  deleteCategory: (id: string) => Promise<string | null>;
  setBudget: (input: {
    categoryId: string;
    amountCents: string;
    monthKey: string;
  }) => Promise<string | null>;
  deleteBudget: (id: string) => Promise<string | null>;
  addGoal: (input: {
    name: string;
    targetCents: string;
    dueDate: string | null;
  }) => Promise<string | null>;
  contributeGoal: (id: string, amountCents: string, note?: string) => Promise<string | null>;
  /** Histórico de aportes da meta (modo API consulta o servidor). */
  goalHistory: (id: string) => Promise<ApiGoalContribution[]>;
  addNetWorthItem: (input: {
    name: string;
    kind: NetWorthItemKind;
    valueCents: string;
    note?: string;
  }) => Promise<string | null>;
  updateNetWorthItemValue: (id: string, valueCents: string) => Promise<string | null>;
  deleteNetWorthItem: (id: string) => Promise<string | null>;
  deleteGoal: (id: string) => Promise<string | null>;
  setHideValues: (value: boolean) => void;
  toggleTheme: () => void;
  setShareLevel: (accountId: string, level: ShareLevel) => Promise<string | null>;
  /** Convida alguém pelo e-mail; no modo API a parceria nasce pendente. */
  invitePartner: (email: string) => Promise<string | null>;
  acceptPartnership: (partnershipId?: string) => Promise<string | null>;
  revokePartnership: () => Promise<string | null>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

function loadStored<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveStored(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento indisponível (modo privado / cota cheia): segue em memória.
  }
}

/** Mensagem curta e legível para erros vindos da API ou da rede. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível concluir a operação.';
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  // Determinístico: servidor e cliente renderizam o mesmo HTML inicial.
  const [snapshot, setSnapshot] = useState<FinanceSnapshot>(() => buildDemoSnapshot());
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  /** Limpa o estado local da sessão sem falar com a rede. */
  const forceSignOut = useCallback((message?: string) => {
    sessionRef.current = null;
    setSession(null);
    saveStored(SESSION_KEY, null);
    saveStored(DEMO_SNAPSHOT_KEY, null);
    saveStored('mf.session.api', null);
    setSnapshot(buildDemoSnapshot());
    api.setToken(null);
    setSyncError(message ?? null);
  }, []);

  /**
   * Sai da conta. No modo API o token também é revogado no servidor — sem isso,
   * "sair" só apagava o token do navegador e o JWT continuava valendo até
   * expirar (quem tivesse uma cópia seguia entrando).
   */
  const signOut = useCallback(async () => {
    const wasApi = sessionRef.current?.mode === 'api';
    forceSignOut();
    if (wasApi) {
      // Best-effort: se a rede falhar, o estado local já saiu da sessão.
      await api.logout().catch(() => undefined);
    }
  }, [forceSignOut]);

  /**
   * Confere no servidor se o token guardado ainda vale.
   *
   * Sessão revogada (logout em outro aparelho, troca de senha) responde `401`:
   * limpamos o estado e voltamos para o login, em vez de exibir dados que não
   * vão poder ser salvos.
   */
  const ensureSession = useCallback(async (): Promise<boolean> => {
    try {
      const status = await api.authStatus();
      const user: FinanceUser = {
        id: status.user.id,
        name: status.user.name,
        email: status.user.email,
        // `GET /auth/status` já devolve o estado do segundo fator; sem copiar
        // aqui a tela de Configurações mostrava "inativa" para quem tem MFA.
        mfaEnabled: status.user.mfaEnabled,
      };
      const nextSession: Session = { mode: 'api', user };
      sessionRef.current = nextSession;
      setSession(nextSession);
      saveStored(SESSION_KEY, nextSession);
      return true;
    } catch (error) {
      const unauthorized =
        error instanceof Error &&
        'isUnauthorized' in error &&
        (error as { isUnauthorized?: boolean }).isUnauthorized === true;
      if (unauthorized) {
        forceSignOut('Sua sessão expirou ou foi encerrada. Entre novamente.');
      } else {
        // Falha de rede não invalida a sessão: seguimos com o que está guardado.
        return true;
      }
      return false;
    }
  }, [forceSignOut]);

  useEffect(() => {
    const storedSession = loadStored<Session>(SESSION_KEY);
    const storedSnapshot = loadStored<FinanceSnapshot>(DEMO_SNAPSHOT_KEY);
    if (storedSession) {
      sessionRef.current = storedSession;
      setSession(storedSession);
    }
    if (storedSnapshot && storedSession?.mode === 'demo') {
      setSnapshot(storedSnapshot);
    }
    if (storedSession?.mode === 'api') {
      // Sessão real: nada de demo, nem durante a hidratação.
      setSnapshot(buildEmptySnapshot());
    }
    setHydrated(true);

    if (storedSession?.mode === 'api') {
      void (async () => {
        // A sessão guardada pode ter sido revogada em outro aparelho (logout,
        // troca de senha): vale perguntar ao servidor antes de mostrar o painel.
        const stillValid = await ensureSession();
        if (!stillValid) return;
        try {
          const remote = await fetchApiSnapshot();
          setSnapshot(remote);
        } catch {
          setSyncError('Não foi possível carregar os dados da API. Verifique sua conexão.');
        }
      })();
    }
    // Roda uma vez, na hidratação: `ensureSession` é estável (useCallback sem
    // dependências mutáveis) e não deve reexecutar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSnapshot = useCallback((updater: (current: FinanceSnapshot) => FinanceSnapshot) => {
    setSnapshot((current) => {
      const next = updater(current);
      if (sessionRef.current?.mode === 'demo') {
        saveStored(DEMO_SNAPSHOT_KEY, next);
      }
      return next;
    });
  }, []);

  const startDemo = useCallback(() => {
    const nextSession: Session = { mode: 'demo', user: { ...DEMO_USER } };
    sessionRef.current = nextSession;
    setSession(nextSession);
    setSyncError(null);
    saveStored(SESSION_KEY, nextSession);
    const stored = loadStored<FinanceSnapshot>(DEMO_SNAPSHOT_KEY);
    setSnapshot(stored ?? buildDemoSnapshot());
  }, []);

  const startApiSession = useCallback(async (user: FinanceUser) => {
    const nextSession: Session = { mode: 'api', user };
    sessionRef.current = nextSession;
    setSession(nextSession);
    saveStored(SESSION_KEY, nextSession);
    // Zera o conteúdo fictício **antes** de buscar: a tela não pode mostrar
    // dados de demonstração numa conta real, nem por meio segundo. Se a busca
    // falhar, o usuário vê o painel vazio com o aviso de erro — não um extrato
    // inventado de outra pessoa.
    setSnapshot(buildEmptySnapshot());
    setSyncing(true);
    setSyncError(null);
    try {
      const remote = await fetchApiSnapshot();
      setSnapshot(remote);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Falha ao sincronizar com a API.');
    } finally {
      setSyncing(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (sessionRef.current?.mode !== 'api') return;
    setSyncing(true);
    setSyncError(null);
    try {
      const remote = await fetchApiSnapshot();
      setSnapshot(remote);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Falha ao sincronizar com a API.');
    } finally {
      setSyncing(false);
    }
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = buildDemoSnapshot();
    setSnapshot(fresh);
    saveStored(DEMO_SNAPSHOT_KEY, fresh);
  }, []);

  /** Roda a mutação local (demo) ou a remota (API) e devolve erro legível. */
  const mutate = useCallback(
    async (
      localUpdater: (current: FinanceSnapshot) => FinanceSnapshot,
      remote?: () => Promise<unknown>
    ): Promise<string | null> => {
      if (sessionRef.current?.mode !== 'api') {
        updateSnapshot(localUpdater);
        return null;
      }
      if (!remote) {
        return 'Esta operação ainda não está disponível quando você usa a API.';
      }
      try {
        await remote();
        const remoteSnapshot = await fetchApiSnapshot();
        setSnapshot(remoteSnapshot);
        setSyncError(null);
        return null;
      } catch (error) {
        const message = errorMessage(error);
        setSyncError(message);
        return message;
      }
    },
    [updateSnapshot]
  );

  const addTransaction = useCallback(
    (input: NewTransaction) =>
      mutate(
        (current) => {
          const transaction: FinanceTransaction = {
            id: createId('tx'),
            accountId: input.accountId,
            categoryId: input.categoryId,
            description: input.description.trim() || 'Lançamento',
            amountCents: input.amountCents,
            type: input.type,
            origin: 'manual',
            date: input.date || todayISO(),
            competenceDate: input.competenceDate || input.date || todayISO(),
            status: input.type === 'transfer' ? 'paid' : (input.status ?? 'pending'),
            paidAt: null,
            dueDate: input.dueDate ?? null,
            createdAt: new Date().toISOString(),
          };
          const delta = BigInt(transaction.amountCents);
          // Pendente é conta a pagar/receber: não é dinheiro no caixa.
          const movesBalance = transaction.status === 'paid';
          const targetAccountId =
            input.type === 'transfer' && input.transferAccountId ? input.transferAccountId : null;
          // Transferência move o dinheiro sem entrar em receita/despesa.
          const accounts: FinanceAccount[] = current.accounts.map((account) => {
            if (!movesBalance) {
              return account;
            }
            if (targetAccountId && account.id === input.accountId) {
              return {
                ...account,
                balanceCents: (BigInt(account.balanceCents) - delta).toString(),
              };
            }
            if (targetAccountId && account.id === targetAccountId) {
              return {
                ...account,
                balanceCents: (BigInt(account.balanceCents) + delta).toString(),
              };
            }
            if (!targetAccountId && account.id === input.accountId) {
              return {
                ...account,
                balanceCents: (BigInt(account.balanceCents) + delta).toString(),
              };
            }
            return account;
          });
          return { ...current, accounts, transactions: [transaction, ...current.transactions] };
        },
        () =>
          api.createTransaction({
            accountId: input.accountId,
            description: input.description.trim() || 'Lançamento',
            amountCents: input.amountCents,
            type: input.type,
            categoryId: input.categoryId ?? undefined,
            transferAccountId: input.transferAccountId ?? undefined,
            date: input.date || todayISO(),
            competenceDate: input.competenceDate ?? undefined,
            status: input.status ?? undefined,
            dueDate: input.dueDate ?? undefined,
          })
      ),
    [mutate]
  );

  const deleteTransaction = useCallback(
    (id: string) =>
      mutate(
        (current) => {
          const target = current.transactions.find((transaction) => transaction.id === id);
          if (!target) return current;
          const delta = -BigInt(target.amountCents);
          // Remover um pendente não devolve nada ao caixa: ele nunca saiu de lá.
          const movesBalance = (target.status ?? 'paid') === 'paid';
          return {
            ...current,
            accounts: movesBalance
              ? current.accounts.map((account) =>
                  account.id === target.accountId
                    ? {
                        ...account,
                        balanceCents: (BigInt(account.balanceCents) + delta).toString(),
                      }
                    : account
                )
              : current.accounts,
            transactions: current.transactions.filter((transaction) => transaction.id !== id),
          };
        },
        () => api.deleteTransaction(id)
      ),
    [mutate]
  );

  const settleTransaction = useCallback(
    (id: string, paidAt?: string) =>
      mutate(
        (current) => {
          const target = current.transactions.find((transaction) => transaction.id === id);
          if (!target || (target.status ?? 'paid') === 'paid') return current;
          const when = paidAt || todayISO();
          return {
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === target.accountId
                ? {
                    ...account,
                    balanceCents: (
                      BigInt(account.balanceCents) + BigInt(target.amountCents)
                    ).toString(),
                  }
                : account
            ),
            transactions: current.transactions.map((transaction) =>
              transaction.id === id
                ? { ...transaction, status: 'paid', paidAt: when, date: when }
                : transaction
            ),
          };
        },
        () => api.settleTransaction(id, paidAt)
      ),
    [mutate]
  );

  const cancelTransaction = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          transactions: current.transactions.map((transaction) =>
            transaction.id === id ? { ...transaction, status: 'canceled' } : transaction
          ),
        }),
        () => api.cancelTransaction(id)
      ),
    [mutate]
  );

  const addAccount = useCallback(
    (input: NewAccount) =>
      mutate(
        (current) => {
          const owner = sessionRef.current?.user ?? DEMO_USER;
          const account: FinanceAccount = {
            id: createId('acc'),
            name: input.name.trim(),
            institution: input.institution?.trim() || null,
            type: input.type,
            currency: 'BRL',
            balanceCents: input.balanceCents ?? '0',
            shareLevel: input.shareLevel,
            ownerId: owner.id,
            ownerName: owner.name,
            color: '#7c5cff',
            isActive: true,
          };
          return { ...current, accounts: [...current.accounts, account] };
        },
        () =>
          api.createAccount({
            name: input.name.trim(),
            institution: input.institution?.trim() || undefined,
            type: input.type,
            // Sem isto o saldo informado na criação ficava só na tela: a API
            // criava a conta zerada e o primeiro refresh apagava o valor.
            ...(input.balanceCents && input.balanceCents !== '0'
              ? { balanceCents: input.balanceCents }
              : {}),
          })
      ),
    [mutate]
  );

  /**
   * Conta vinda do banco.
   *
   * No modo demonstração não existe instituição: a função explica isso em vez
   * de inventar uma conta com saldo fictício (que poluiria os totais do demo).
   */
  const linkBankAccount = useCallback(
    async (input: { provider: string; providerAccountId: string }): Promise<string | null> => {
      if (sessionRef.current?.mode !== 'api') {
        return 'Vincular banco exige uma conta real. Você está no modo demonstração.';
      }
      try {
        await api.linkAccount(input);
        const remoteSnapshot = await fetchApiSnapshot();
        setSnapshot(remoteSnapshot);
        setSyncError(null);
        return null;
      } catch (error) {
        const message = errorMessage(error);
        setSyncError(message);
        return message;
      }
    },
    []
  );

  const connectBank = useCallback(
    async (
      openWidget: (connectToken: string) => Promise<string | null>
    ): Promise<string | null> => {
      if (sessionRef.current?.mode !== 'api') {
        return 'Conectar banco exige uma conta real. Você está no modo demonstração.';
      }
      try {
        const { accessToken } = await api.getConnectToken();
        const itemId = await openWidget(accessToken);
        if (!itemId) return null; // usuário fechou o widget: não é erro.
        await api.connectItem(itemId);
        const remoteSnapshot = await fetchApiSnapshot();
        setSnapshot(remoteSnapshot);
        setSyncError(null);
        return null;
      } catch (error) {
        const message = errorMessage(error);
        setSyncError(message);
        return message;
      }
    },
    []
  );

  const deleteAccount = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          accounts: current.accounts.filter((account) => account.id !== id),
          transactions: current.transactions.filter((transaction) => transaction.accountId !== id),
        }),
        () => api.removeAccount(id)
      ),
    [mutate]
  );

  const addCategory = useCallback(
    (input: { name: string; color: string; kind: FinanceCategory['kind'] }) =>
      mutate(
        (current) => ({
          ...current,
          categories: [
            ...current.categories,
            {
              id: createId('cat'),
              name: input.name.trim(),
              color: input.color,
              isSystem: false,
              kind: input.kind,
            },
          ],
        }),
        () => api.createCategory({ name: input.name.trim(), color: input.color })
      ),
    [mutate]
  );

  const deleteCategory = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          categories: current.categories.filter((category) => category.id !== id),
          transactions: current.transactions.map((transaction) =>
            transaction.categoryId === id ? { ...transaction, categoryId: null } : transaction
          ),
          budgets: current.budgets.filter((budget) => budget.categoryId !== id),
        }),
        () => api.deleteCategory(id)
      ),
    [mutate]
  );

  const setBudget = useCallback(
    (input: { categoryId: string; amountCents: string; monthKey: string }) => {
      const { start, end } = monthBounds(input.monthKey);
      /**
       * O id do orçamento existente é resolvido **dentro** do `mutate`, com o
       * estado mais recente. Antes vinha do `snapshot` capturado no closure:
       * dois cliques rápidos no mesmo mês liam o mesmo estado velho e o segundo
       * `POST` criava um orçamento duplicado para a mesma categoria/período.
       */
      return mutate(
        (current) => {
          const local = current.budgets.find(
            (budget) => budget.categoryId === input.categoryId && budget.periodStart === start
          );
          if (local) {
            return {
              ...current,
              budgets: current.budgets.map((budget) =>
                budget.id === local.id ? { ...budget, amountCents: input.amountCents } : budget
              ),
            };
          }
          return {
            ...current,
            budgets: [
              ...current.budgets,
              {
                id: createId('bud'),
                categoryId: input.categoryId,
                amountCents: input.amountCents,
                periodStart: start,
                periodEnd: end,
              },
            ],
          };
        },
        async () => {
          // Fonte da verdade é a API: perguntamos o que já existe no mês em vez
          // de confiar no snapshot em memória (que pode estar velho).
          const remote = await api.getBudgets();
          const existing = remote.find(
            (budget) =>
              budget.categoryId === input.categoryId && budget.periodStart.slice(0, 10) === start
          );
          if (existing) {
            await api.updateBudget(existing.id, { amountCents: input.amountCents });
            return;
          }
          await api.createBudget({
            categoryId: input.categoryId,
            amountCents: input.amountCents,
            periodStart: start,
            periodEnd: end,
          });
        }
      );
    },
    [mutate]
  );

  const deleteBudget = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          budgets: current.budgets.filter((budget) => budget.id !== id),
        }),
        () => api.deleteBudget(id)
      ),
    [mutate]
  );

  const addGoal = useCallback(
    (input: { name: string; targetCents: string; dueDate: string | null }) =>
      mutate(
        (current) => {
          const goal: FinanceGoal = {
            id: createId('goal'),
            name: input.name.trim(),
            targetCents: input.targetCents,
            currentCents: '0',
            dueDate: input.dueDate,
          };
          return { ...current, goals: [...current.goals, goal] };
        },
        () =>
          api.createGoal({
            name: input.name.trim(),
            targetCents: input.targetCents,
            dueDate: input.dueDate ?? undefined,
          })
      ),
    [mutate]
  );

  /**
   * Aporte em uma meta.
   *
   * No modo API o valor vai para `/financial-goals/:id/contributions`: o
   * servidor é quem soma e guarda o histórico, então dois aparelhos não
   * sobrescrevem o saldo um do outro. No modo demonstração, soma local.
   */
  const contributeGoal = useCallback(
    (id: string, amountCents: string, note?: string) => {
      // O novo saldo é calculado a partir do estado corrente **dentro** do
      // updater: ler `snapshot.goals` do closure fazia dois aportes seguidos
      // usarem o mesmo valor base e o segundo "engolir" o primeiro.
      return mutate(
        (current) => ({
          ...current,
          goals: current.goals.map((item) =>
            item.id === id
              ? {
                  ...item,
                  currentCents: (BigInt(item.currentCents) + BigInt(amountCents)).toString(),
                }
              : item
          ),
        }),
        () => api.addGoalContribution(id, { amountCents, note })
      );
    },
    [mutate]
  );

  /**
   * Histórico de aportes.
   *
   * No modo demonstração NÃO existe histórico: antes a tela inventava um único
   * "aporte" com o saldo atual da meta, datado no **vencimento** — um dado
   * fictício apresentado como histórico real. Agora devolve lista vazia e a
   * tela diz que não há aportes registrados.
   */
  const goalHistory = useCallback(async (id: string): Promise<ApiGoalContribution[]> => {
    if (sessionRef.current?.mode !== 'api') return [];
    try {
      return await api.getGoalContributions(id);
    } catch {
      return [];
    }
  }, []);

  /** Bem ou dívida: entra no patrimônio, não no caixa. */
  const addNetWorthItem = useCallback(
    (input: { name: string; kind: NetWorthItemKind; valueCents: string; note?: string }) =>
      mutate(
        (current) => ({
          ...current,
          netWorthItems: [
            ...(current.netWorthItems ?? []),
            {
              id: createId('nw'),
              name: input.name.trim() || (input.kind === 'asset' ? 'Bem' : 'Dívida'),
              kind: input.kind,
              valueCents: input.valueCents,
              note: input.note ?? null,
            },
          ],
        }),
        () => api.createNetWorthItem(input)
      ),
    [mutate]
  );

  const updateNetWorthItemValue = useCallback(
    (id: string, valueCents: string) =>
      mutate(
        (current) => ({
          ...current,
          netWorthItems: (current.netWorthItems ?? []).map((item) =>
            item.id === id ? { ...item, valueCents } : item
          ),
        }),
        () => api.updateNetWorthItem(id, { valueCents })
      ),
    [mutate]
  );

  const deleteNetWorthItem = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          netWorthItems: (current.netWorthItems ?? []).filter((item) => item.id !== id),
        }),
        () => api.deleteNetWorthItem(id)
      ),
    [mutate]
  );

  const deleteGoal = useCallback(
    (id: string) =>
      mutate(
        (current) => ({
          ...current,
          goals: current.goals.filter((goal) => goal.id !== id),
        }),
        () => api.deleteGoal(id)
      ),
    [mutate]
  );

  /**
   * Tema e "esconder valores" são preferências **do navegador**, não dado
   * financeiro: ficam em `mf.settings.v1` e sobrevivem a recarregar a página.
   *
   * Antes só viviam no snapshot, que é remontado a partir da API a cada
   * mutação — na prática, salvar um lançamento no modo API devolvia o tema para
   * escuro e reexibia os valores.
   */
  const persistSettings = useCallback((settings: FinanceSnapshot['settings']) => {
    saveStored(SETTINGS_KEY, { theme: settings.theme, hideValues: settings.hideValues });
  }, []);

  const setHideValues = useCallback(
    (value: boolean) => {
      updateSnapshot((current) => {
        const next = { ...current, settings: { ...current.settings, hideValues: value } };
        persistSettings(next.settings);
        return next;
      });
    },
    [updateSnapshot, persistSettings]
  );

  const toggleTheme = useCallback(() => {
    updateSnapshot((current) => {
      const next = {
        ...current,
        settings: {
          ...current.settings,
          theme: current.settings.theme === 'dark' ? ('light' as const) : ('dark' as const),
        },
      };
      persistSettings(next.settings);
      return next;
    });
  }, [updateSnapshot, persistSettings]);

  const setShareLevel = useCallback(
    (accountId: string, level: ShareLevel) =>
      mutate(
        (current) => ({
          ...current,
          accounts: current.accounts.map((account) =>
            account.id === accountId ? { ...account, shareLevel: level } : account
          ),
        }),
        () => api.setShareLevel(accountId, level)
      ),
    [mutate]
  );

  /**
   * No modo demonstração o convite é imediato (os dados são fictícios); na API
   * vira um pedido pendente que só o outro aceita.
   */
  const invitePartner = useCallback(
    (email: string) =>
      mutate(
        (current) => ({
          ...current,
          partner: {
            id: createId('partner'),
            name: email.split('@')[0] || 'Parceiro',
            email,
            status: 'pending',
          },
        }),
        () => api.invitePartner(email)
      ),
    [mutate]
  );

  const acceptPartnership = useCallback(
    (partnershipId?: string) =>
      mutate(
        (current) => ({
          ...current,
          partner: current.partner ? { ...current.partner, status: 'accepted' } : current.partner,
        }),
        () => api.acceptPartnership(partnershipId)
      ),
    [mutate]
  );

  const revokePartnership = useCallback(
    () =>
      mutate(
        (current) => ({
          ...current,
          partner: null,
          accounts: current.accounts
            .filter(
              (account) => !account.ownerId || account.ownerId === sessionRef.current?.user.id
            )
            .map((account) => ({ ...account, shareLevel: 'private' as ShareLevel })),
        }),
        () => api.revokePartnership()
      ),
    [mutate]
  );

  const value = useMemo<FinanceContextValue>(
    () => ({
      session,
      snapshot,
      hydrated,
      syncing,
      syncError,
      isDemo: session?.mode === 'demo',
      startDemo,
      startApiSession,
      signOut,
      resetDemo,
      refresh,
      addTransaction,
      settleTransaction,
      cancelTransaction,
      deleteTransaction,
      addAccount,
      linkBankAccount,
      connectBank,
      deleteAccount,
      addCategory,
      deleteCategory,
      setBudget,
      deleteBudget,
      addGoal,
      contributeGoal,
      goalHistory,
      addNetWorthItem,
      updateNetWorthItemValue,
      deleteNetWorthItem,
      deleteGoal,
      setHideValues,
      toggleTheme,
      setShareLevel,
      invitePartner,
      acceptPartnership,
      revokePartnership,
    }),
    [
      session,
      snapshot,
      hydrated,
      syncing,
      syncError,
      startDemo,
      startApiSession,
      signOut,
      resetDemo,
      refresh,
      addTransaction,
      settleTransaction,
      cancelTransaction,
      deleteTransaction,
      addAccount,
      linkBankAccount,
      deleteAccount,
      addCategory,
      deleteCategory,
      setBudget,
      deleteBudget,
      addGoal,
      contributeGoal,
      goalHistory,
      addNetWorthItem,
      updateNetWorthItemValue,
      deleteNetWorthItem,
      deleteGoal,
      setHideValues,
      toggleTheme,
      setShareLevel,
      invitePartner,
      acceptPartnership,
      revokePartnership,
      connectBank,
    ]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance deve ser usado dentro de FinanceProvider');
  }
  return context;
}
