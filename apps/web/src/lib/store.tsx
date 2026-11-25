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
  addTransaction: (input: NewTransaction) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (input: NewAccount) => void;
  deleteAccount: (id: string) => void;
  addCategory: (input: { name: string; color: string; kind: FinanceCategory['kind'] }) => void;
  deleteCategory: (id: string) => void;
  setBudget: (input: { categoryId: string; amountCents: string; monthKey: string }) => void;
  deleteBudget: (id: string) => void;
  addGoal: (input: { name: string; targetCents: string; dueDate: string | null }) => void;
  contributeGoal: (id: string, amountCents: string) => void;
  deleteGoal: (id: string) => void;
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

  const addTransaction = useCallback(
    (input: NewTransaction) => {
      updateSnapshot((current) => {
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
        const accounts: FinanceAccount[] = current.accounts.map((account) =>
          account.id === input.accountId
            ? { ...account, balanceCents: (BigInt(account.balanceCents) + delta).toString() }
            : account
        );
        return { ...current, accounts, transactions: [transaction, ...current.transactions] };
      });
    },
    [updateSnapshot]
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      updateSnapshot((current) => {
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
      });
    },
    [updateSnapshot]
  );

  const addAccount = useCallback(
    (input: NewAccount) => {
      updateSnapshot((current) => {
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
      });
    },
    [updateSnapshot]
  );

  const deleteAccount = useCallback(
    (id: string) => {
      updateSnapshot((current) => ({
        ...current,
        accounts: current.accounts.filter((account) => account.id !== id),
        transactions: current.transactions.filter((transaction) => transaction.accountId !== id),
      }));
    },
    [updateSnapshot]
  );

  const addCategory = useCallback(
    (input: { name: string; color: string; kind: FinanceCategory['kind'] }) => {
      updateSnapshot((current) => ({
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
      }));
    },
    [updateSnapshot]
  );

  const deleteCategory = useCallback(
    (id: string) => {
      updateSnapshot((current) => ({
        ...current,
        categories: current.categories.filter((category) => category.id !== id),
        transactions: current.transactions.map((transaction) =>
          transaction.categoryId === id ? { ...transaction, categoryId: null } : transaction
        ),
        budgets: current.budgets.filter((budget) => budget.categoryId !== id),
      }));
    },
    [updateSnapshot]
  );

  const setBudget = useCallback(
    (input: { categoryId: string; amountCents: string; monthKey: string }) => {
      updateSnapshot((current) => {
        const { start, end } = monthBounds(input.monthKey);
        const existing = current.budgets.find(
          (budget) => budget.categoryId === input.categoryId && budget.periodStart === start
        );
        if (existing) {
          return {
            ...current,
            budgets: current.budgets.map((budget) =>
              budget.id === existing.id ? { ...budget, amountCents: input.amountCents } : budget
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
      });
    },
    [updateSnapshot]
  );

  const deleteBudget = useCallback(
    (id: string) => {
      updateSnapshot((current) => ({
        ...current,
        budgets: current.budgets.filter((budget) => budget.id !== id),
      }));
    },
    [updateSnapshot]
  );

  const addGoal = useCallback(
    (input: { name: string; targetCents: string; dueDate: string | null }) => {
      updateSnapshot((current) => {
        const goal: FinanceGoal = {
          id: createId('goal'),
          name: input.name.trim(),
          targetCents: input.targetCents,
          currentCents: '0',
          dueDate: input.dueDate,
        };
        return { ...current, goals: [...current.goals, goal] };
      });
    },
    [updateSnapshot]
  );

  const contributeGoal = useCallback(
    (id: string, amountCents: string) => {
      updateSnapshot((current) => ({
        ...current,
        goals: current.goals.map((goal) =>
          goal.id === id
            ? {
                ...goal,
                currentCents: (BigInt(goal.currentCents) + BigInt(amountCents)).toString(),
              }
            : goal
        ),
      }));
    },
    [updateSnapshot]
  );

  const deleteGoal = useCallback(
    (id: string) => {
      updateSnapshot((current) => ({
        ...current,
        goals: current.goals.filter((goal) => goal.id !== id),
      }));
    },
    [updateSnapshot]
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
