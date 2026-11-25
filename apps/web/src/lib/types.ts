/** Tipos de domínio usados pela interface web. */

export type ShareLevel = 'private' | 'BALANCE_ONLY' | 'FULL';

export type SessionMode = 'demo' | 'api';

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'cash' | 'manual';

export type FinanceUser = {
  id: string;
  name: string;
  email: string;
  mfaEnabled?: boolean;
};

export type FinanceAccount = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  currency: string;
  balanceCents: string;
  shareLevel: ShareLevel;
  ownerId: string;
  ownerName: string;
  color: string;
  isActive: boolean;
};

export type FinanceCategory = {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  /** Tipo padrão sugerido ao lançar uma movimentação nessa categoria. */
  kind: 'expense' | 'income' | 'both';
};

export type TransactionType = 'income' | 'expense' | 'transfer';

export type FinanceTransaction = {
  id: string;
  accountId: string;
  categoryId: string | null;
  description: string;
  /** Centavos em string; negativo para despesa. */
  amountCents: string;
  type: TransactionType;
  origin: 'manual' | 'imported';
  /** ISO date (YYYY-MM-DD). */
  date: string;
  createdAt: string;
};

export type FinanceBudget = {
  id: string;
  categoryId: string;
  amountCents: string;
  periodStart: string;
  periodEnd: string;
};

export type FinanceGoal = {
  id: string;
  name: string;
  targetCents: string;
  currentCents: string;
  dueDate: string | null;
};

export type FinancePartner = {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'accepted';
};

export type FinanceSettings = {
  theme: 'dark' | 'light';
  hideValues: boolean;
  partnerName: string;
};

export type FinanceSnapshot = {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  budgets: FinanceBudget[];
  goals: FinanceGoal[];
  partner: FinancePartner | null;
  settings: FinanceSettings;
};

export type NewAccount = {
  name: string;
  institution?: string;
  type: AccountType;
  shareLevel: ShareLevel;
};

export type NewTransaction = {
  accountId: string;
  categoryId: string | null;
  description: string;
  amountCents: string;
  type: TransactionType;
  /** Só para transferências: conta que recebe o valor. */
  transferAccountId?: string | null;
  date: string;
};
