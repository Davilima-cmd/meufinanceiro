import {
  formatMonthShort,
  monthBounds,
  monthKeyOf,
  monthRange,
  sumCents,
  todayISO,
  toCents,
} from './format';
import type { FinanceSnapshot, FinanceTransaction, ShareLevel } from './types';

export type VisibleAccount = FinanceSnapshot['accounts'][number] & {
  /** Somente as transações de contas FULL entram em relatórios detalhados. */
  transactionsVisible: boolean;
};

export type CategoryTotal = {
  id: string;
  name: string;
  color: string;
  cents: bigint;
  share: number;
};

export type MonthlyPoint = {
  monthKey: string;
  label: string;
  incomeCents: bigint;
  expenseCents: bigint;
  netCents: bigint;
};

export type Overview = {
  monthKey: string;
  monthLabel: string;
  netWorthCents: bigint;
  personalBalanceCents: bigint;
  sharedBalanceCents: bigint;
  incomeCents: bigint;
  expenseCents: bigint;
  netCents: bigint;
  savingsRate: number;
  previousExpenseCents: bigint;
  expenseChange: number | null;
  transactionCount: number;
  visibleTransactions: FinanceTransaction[];
  categories: CategoryTotal[];
  trend: MonthlyPoint[];
  daily: Array<{ day: number; incomeCents: bigint; expenseCents: bigint }>;
  biggestExpense: FinanceTransaction | null;
  pendingBudgets: Array<{
    id: string;
    name: string;
    color: string;
    percent: number;
    remainingCents: string;
  }>;
  goals: Array<{
    id: string;
    name: string;
    percent: number;
    currentCents: string;
    targetCents: string;
  }>;
};

function isTransactionVisible(transaction: FinanceTransaction, accounts: VisibleAccount[]) {
  const account = accounts.find((item) => item.id === transaction.accountId);
  return Boolean(account?.transactionsVisible);
}

/**
 * Uma conta tem histórico visível quando é do próprio usuário ou quando o
 * dono liberou o nível FULL. Contas apenas com saldo (BALANCE_ONLY) entram no
 * patrimônio, mas não nos relatórios detalhados.
 */
export function visibleAccounts(snapshot: FinanceSnapshot, ownerId: string): VisibleAccount[] {
  return snapshot.accounts.map((account) => ({
    ...account,
    transactionsVisible: account.ownerId === ownerId || account.shareLevel === 'FULL',
  }));
}

export function isOwnAccount(
  account: { ownerId: string; shareLevel: ShareLevel },
  ownerId: string
) {
  return account.ownerId === ownerId;
}

export function transactionsOfMonth(
  transactions: FinanceTransaction[],
  monthKey: string
): FinanceTransaction[] {
  return transactions.filter((transaction) => monthKeyOf(transaction.date) === monthKey);
}

export function coverage(
  transactions: FinanceTransaction[],
  accounts: VisibleAccount[]
): { visible: FinanceTransaction[]; hiddenAccounts: number } {
  const visible = transactions.filter((transaction) => isTransactionVisible(transaction, accounts));
  const hiddenAccounts = accounts.filter((account) => !account.transactionsVisible).length;
  return { visible, hiddenAccounts };
}

function categoryTotals(
  transactions: FinanceTransaction[],
  snapshot: FinanceSnapshot
): CategoryTotal[] {
  const expenses = transactions.filter(
    (transaction) => toCents(transaction.amountCents) < 0n && transaction.type === 'expense'
  );
  const total = sumCents(expenses.map((transaction) => -toCents(transaction.amountCents)));
  if (total === 0n) return [];

  const byCategory = new Map<string, bigint>();
  for (const transaction of expenses) {
    const key = transaction.categoryId ?? 'sem-categoria';
    byCategory.set(key, (byCategory.get(key) ?? 0n) + -toCents(transaction.amountCents));
  }

  return [...byCategory.entries()]
    .map(([id, cents]) => {
      const category = snapshot.categories.find((item) => item.id === id);
      return {
        id,
        name: category?.name ?? 'Sem categoria',
        color: category?.color ?? '#8b97a3',
        cents,
        share: Math.round((Number(cents) / Number(total)) * 100),
      };
    })
    .sort((left, right) => (right.cents > left.cents ? 1 : -1));
}

export function buildTrend(
  transactions: FinanceTransaction[],
  accounts: VisibleAccount[],
  endMonth: string,
  months = 6
): MonthlyPoint[] {
  const { visible } = coverage(transactions, accounts);
  return monthRange(endMonth, months).map((monthKey) => {
    const items = transactionsOfMonth(visible, monthKey);
    const incomeCents = sumCents(
      items.filter((item) => toCents(item.amountCents) > 0n).map((item) => item.amountCents)
    );
    const expenseCents = -sumCents(
      items
        .filter((item) => toCents(item.amountCents) < 0n && item.type !== 'transfer')
        .map((item) => item.amountCents)
    );
    return {
      monthKey,
      label: formatMonthShort(monthKey),
      incomeCents,
      expenseCents,
      netCents: incomeCents - expenseCents,
    };
  });
}

export function buildOverview(
  snapshot: FinanceSnapshot,
  monthKey: string,
  ownerId: string
): Overview {
  const accounts = visibleAccounts(snapshot, ownerId);
  const monthTransactions = transactionsOfMonth(
    coverage(snapshot.transactions, accounts).visible,
    monthKey
  );
  const expenses = monthTransactions.filter(
    (item) => toCents(item.amountCents) < 0n && item.type !== 'transfer'
  );
  const incomes = monthTransactions.filter(
    (item) => toCents(item.amountCents) > 0n && item.type !== 'transfer'
  );

  const expenseCents = -sumCents(expenses.map((item) => item.amountCents));
  const incomeCents = sumCents(incomes.map((item) => item.amountCents));
  const previousMonthTransactions = transactionsOfMonth(
    coverage(snapshot.transactions, accounts).visible,
    previousMonth(monthKey)
  );
  const previousExpenseCents = -sumCents(
    previousMonthTransactions
      .filter((item) => toCents(item.amountCents) < 0n && item.type !== 'transfer')
      .map((item) => item.amountCents)
  );

  const personalBalanceCents = sumCents(
    accounts.filter((account) => account.ownerId === ownerId).map((account) => account.balanceCents)
  );
  const sharedBalanceCents = sumCents(
    accounts
      .filter((account) => account.ownerId !== ownerId && account.shareLevel !== 'private')
      .map((account) => account.balanceCents)
  );

  const dailyMap = new Map<number, { incomeCents: bigint; expenseCents: bigint }>();
  for (const transaction of monthTransactions) {
    const day = Number(transaction.date.slice(8, 10));
    const bucket = dailyMap.get(day) ?? { incomeCents: 0n, expenseCents: 0n };
    const cents = toCents(transaction.amountCents);
    if (cents > 0n) bucket.incomeCents += cents;
    else bucket.expenseCents += -cents;
    dailyMap.set(day, bucket);
  }

  const biggestExpense =
    [...expenses].sort((left, right) =>
      toCents(left.amountCents) < toCents(right.amountCents) ? -1 : 1
    )[0] ?? null;

  const monthExpenses = coverage(snapshot.transactions, accounts).visible.filter(
    (item) => toCents(item.amountCents) < 0n && item.type === 'expense'
  );

  const budgets = snapshot.budgets
    .filter((budget) => budget.periodStart.slice(0, 7) === monthKey)
    .map((budget) => {
      const category = snapshot.categories.find((item) => item.id === budget.categoryId);
      const spent = -sumCents(
        monthExpenses
          .filter((item) => item.categoryId === budget.categoryId)
          .map((item) => item.amountCents)
      );
      const limit = toCents(budget.amountCents);
      const percent = limit > 0n ? Math.round((Number(spent) / Number(limit)) * 100) : 0;
      return {
        id: budget.id,
        name: category?.name ?? 'Categoria',
        color: category?.color ?? '#8b97a3',
        percent,
        remainingCents: (limit - spent).toString(),
      };
    })
    .sort((left, right) => right.percent - left.percent);

  const goals = snapshot.goals.map((goal) => {
    const target = toCents(goal.targetCents);
    const current = toCents(goal.currentCents);
    return {
      id: goal.id,
      name: goal.name,
      percent:
        target > 0n ? Math.min(100, Math.round((Number(current) / Number(target)) * 100)) : 0,
      currentCents: goal.currentCents,
      targetCents: goal.targetCents,
    };
  });

  return {
    monthKey,
    monthLabel: monthKey,
    netWorthCents: personalBalanceCents + sharedBalanceCents,
    personalBalanceCents,
    sharedBalanceCents,
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    savingsRate:
      incomeCents > 0n
        ? Math.round((Number(incomeCents - expenseCents) / Number(incomeCents)) * 100)
        : 0,
    previousExpenseCents,
    expenseChange:
      previousExpenseCents > 0n
        ? Math.round(
            (Number(expenseCents - previousExpenseCents) / Number(previousExpenseCents)) * 100
          )
        : null,
    transactionCount: monthTransactions.length,
    visibleTransactions: [...monthTransactions].sort((left, right) =>
      left.date < right.date ? 1 : -1
    ),
    categories: categoryTotals(monthTransactions, snapshot),
    trend: buildTrend(snapshot.transactions, accounts, monthKey, 6),
    daily: [...dailyMap.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .sort((left, right) => left.day - right.day),
    biggestExpense,
    pendingBudgets: budgets,
    goals,
  };
}

function previousMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Total gasto por categoria em um mês (usado na tela de categorias e orçamentos). */
export function spentByCategory(
  snapshot: FinanceSnapshot,
  monthKey: string,
  ownerId: string
): Map<string, bigint> {
  const accounts = visibleAccounts(snapshot, ownerId);
  const transactions = coverage(snapshot.transactions, accounts).visible;
  const result = new Map<string, bigint>();
  for (const transaction of transactionsOfMonth(transactions, monthKey)) {
    const cents = toCents(transaction.amountCents);
    // Transferências movem dinheiro entre contas: não são consumo e não
    // devem consumir orçamento de categoria.
    if (cents >= 0n || !transaction.categoryId || transaction.type === 'transfer') continue;
    result.set(transaction.categoryId, (result.get(transaction.categoryId) ?? 0n) + -cents);
  }
  return result;
}

/** Sugestões de descrição para lançamento rápido (últimos lançamentos do usuário). */
export function recentDescriptions(snapshot: FinanceSnapshot, limit = 5): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const transaction of snapshot.transactions) {
    if (seen.has(transaction.description)) continue;
    seen.add(transaction.description);
    result.push(transaction.description);
    if (result.length >= limit) break;
  }
  return result;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function boundsForMonth(monthKey: string) {
  return monthBounds(monthKey);
}
