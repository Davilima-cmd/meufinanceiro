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
import { buildDemoSnapshot, DEMO_USER } from './demo-data';
import { fetchApiSnapshot } from './api-snapshot';
import { api } from './api';
import type {
  ShareLevel,
  FinanceAccount,
  FinanceCategory,
  FinanceGoal,
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
  signOut: () => void;
  resetDemo: () => void;
  refresh: () => Promise<void>;
  /**
   * Mutações devolvem o erro quando a API rejeita a operação. No modo
   * demonstração resolvem com `null` (tudo é local).
   */
  addTransaction: (input: NewTransaction) => Promise<string | null>;
  deleteTransaction: (id: string) => Promise<string | null>;
  addAccount: (input: NewAccount) => Promise<string | null>;
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
  contributeGoal: (id: string, amountCents: string) => Promise<string | null>;
  deleteGoal: (id: string) => Promise<string | null>;
  setHideValues: (value: boolean) => void;
  toggleTheme: () => void;
  setShareLevel: (accountId: string, level: ShareLevel) => void;
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
    setHydrated(true);

    if (storedSession?.mode === 'api') {
      void (async () => {
        try {
          const remote = await fetchApiSnapshot();
          setSnapshot(remote);
        } catch {
          setSyncError('Não foi possível carregar os dados da API. Verifique sua conexão.');
        }
      })();
    }
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
    setSyncing(true);
    setSyncError(null);
    try {
      const remote = await fetchApiSnapshot();
      setSnapshot({
        ...remote,
        partner: null,
        settings: { theme: 'dark', hideValues: false, partnerName: 'Parceiro' },
      });
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

  const signOut = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    saveStored(SESSION_KEY, null);
    saveStored(DEMO_SNAPSHOT_KEY, null);
    saveStored('mf.session.api', null);
    setSnapshot(buildDemoSnapshot());
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
            createdAt: new Date().toISOString(),
          };
          const delta = BigInt(transaction.amountCents);
          const targetAccountId =
            input.type === 'transfer' && input.transferAccountId ? input.transferAccountId : null;
          // Transferência move o dinheiro sem entrar em receita/despesa.
          const accounts: FinanceAccount[] = current.accounts.map((account) => {
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
          return {
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === target.accountId
                ? { ...account, balanceCents: (BigInt(account.balanceCents) + delta).toString() }
                : account
            ),
            transactions: current.transactions.filter((transaction) => transaction.id !== id),
          };
        },
        () => api.deleteTransaction(id)
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
            balanceCents: '0',
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
          })
      ),
    [mutate]
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
      const existing =
        snapshot.budgets.find(
          (budget) => budget.categoryId === input.categoryId && budget.periodStart === start
        ) ?? null;
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
    [mutate, snapshot.budgets]
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

  const contributeGoal = useCallback(
    (id: string, amountCents: string) => {
      const goal = snapshot.goals.find((item) => item.id === id) ?? null;
      const nextCents = goal ? (BigInt(goal.currentCents) + BigInt(amountCents)).toString() : '0';
      return mutate(
        (current) => ({
          ...current,
          goals: current.goals.map((item) =>
            item.id === id ? { ...item, currentCents: nextCents } : item
          ),
        }),
        () => api.updateGoal(id, { currentCents: nextCents })
      );
    },
    [mutate, snapshot.goals]
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

  const setHideValues = useCallback(
    (value: boolean) => {
      updateSnapshot((current) => ({
        ...current,
        settings: { ...current.settings, hideValues: value },
      }));
    },
    [updateSnapshot]
  );

  const toggleTheme = useCallback(() => {
    updateSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        theme: current.settings.theme === 'dark' ? 'light' : 'dark',
      },
    }));
  }, [updateSnapshot]);

  const setShareLevel = useCallback(
    (accountId: string, level: ShareLevel) => {
      updateSnapshot((current) => ({
        ...current,
        accounts: current.accounts.map((account) =>
          account.id === accountId ? { ...account, shareLevel: level } : account
        ),
      }));
    },
    [updateSnapshot]
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
      deleteTransaction,
      addAccount,
      deleteAccount,
      addCategory,
      deleteCategory,
      setBudget,
      deleteBudget,
      addGoal,
      contributeGoal,
      deleteGoal,
      setHideValues,
      toggleTheme,
      setShareLevel,
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
      deleteTransaction,
      addAccount,
      deleteAccount,
      addCategory,
      deleteCategory,
      setBudget,
      deleteBudget,
      addGoal,
      contributeGoal,
      deleteGoal,
      setHideValues,
      toggleTheme,
      setShareLevel,
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
