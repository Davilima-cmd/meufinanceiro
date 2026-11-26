import {
  api,
  type ApiAccount,
  type ApiBudget,
  type ApiCategory,
  type ApiGoal,
  type ApiTransaction,
} from './api';
import type {
  AccountType,
  FinanceSnapshot,
  FinanceTransaction,
  FinanceUser,
  TransactionType,
} from './types';

/**
 * Converte a resposta da API (centavos em string, categorias/orçamentos
 * separados) no snapshot usado pela interface. A API não expõe o nível de
 * compartilhamento por conta, então tudo é tratado como privado — regra
 * segura por padrão.
 */

function accountType(value: string): AccountType {
  const allowed: AccountType[] = ['checking', 'savings', 'credit', 'investment', 'cash', 'manual'];
  return allowed.includes(value as AccountType) ? (value as AccountType) : 'manual';
}

function transactionType(value: string): TransactionType {
  if (value === 'income' || value === 'transfer') return value;
  return 'expense';
}

const DEFAULT_COLORS = ['#8b7bff', '#22c55e', '#f97316', '#0ea5e9', '#ec4899', '#eab308'];

export function mapApiSnapshot(
  user: FinanceUser,
  accounts: ApiAccount[],
  transactions: ApiTransaction[],
  categories: ApiCategory[],
  budgets: ApiBudget[],
  goals: ApiGoal[]
): FinanceSnapshot {
  const mappedCategories = categories.map((category, index) => {
    const kind: 'expense' | 'income' | 'both' =
      /salário|salario|receita|rendimento|freelance/i.test(category.name) ? 'income' : 'expense';
    return {
      id: category.id,
      name: category.name,
      color: category.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      isSystem: category.isSystem,
      kind,
    };
  });

  const mappedTransactions: FinanceTransaction[] = transactions.map((transaction) => ({
    id: transaction.id,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId ?? null,
    description: transaction.description,
    amountCents: String(transaction.amountCents),
    type: transactionType(transaction.type),
    origin: transaction.origin === 'imported' ? 'imported' : 'manual',
    date: transaction.date.slice(0, 10),
    competenceDate: transaction.competenceDate?.slice(0, 10),
    status: transaction.status,
    paidAt: transaction.paidAt ? transaction.paidAt.slice(0, 10) : null,
    dueDate: transaction.dueDate ? transaction.dueDate.slice(0, 10) : null,
    createdAt: transaction.createdAt,
  }));

  return {
    accounts: accounts.map((account, index) => ({
      id: account.id,
      name: account.name,
      institution: account.institution ?? null,
      type: accountType(account.type),
      currency: account.currency || 'BRL',
      balanceCents: String(account.balanceCents),
      shareLevel: 'private',
      ownerId: user.id,
      ownerName: user.name,
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      isActive: account.isActive,
    })),
    categories: mappedCategories,
    transactions: mappedTransactions,
    budgets: budgets.map((budget) => ({
      id: budget.id,
      categoryId: budget.categoryId,
      amountCents: String(budget.amountCents),
      periodStart: budget.periodStart.slice(0, 10),
      periodEnd: budget.periodEnd.slice(0, 10),
    })),
    goals: goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetCents: String(goal.targetCents),
      currentCents: String(goal.currentCents),
      dueDate: goal.dueDate ? goal.dueDate.slice(0, 10) : null,
    })),
    partner: null,
    settings: { theme: 'dark', hideValues: false, partnerName: 'Parceiro' },
  };
}

export async function fetchApiSnapshot(): Promise<FinanceSnapshot> {
  const [accounts, transactions, categories, budgets, goals] = await Promise.all([
    api.getAccounts(),
    api.getTransactions(),
    api.getCategories(),
    api.getBudgets().catch(() => [] as ApiBudget[]),
    api.getGoals().catch(() => [] as ApiGoal[]),
  ]);
  const stored = localStorage.getItem('mf.session.api');
  const parsed = stored ? (JSON.parse(stored) as { user?: { id: string; name: string } }) : null;
  const user: FinanceUser = {
    id: parsed?.user?.id ?? 'api-user',
    name: parsed?.user?.name ?? 'Você',
    email: '',
  };
  return mapApiSnapshot(user, accounts, transactions, categories, budgets, goals);
}
