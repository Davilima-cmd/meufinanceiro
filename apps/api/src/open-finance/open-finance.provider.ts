export interface OpenFinanceAccount {
  id: string;
  name: string;
  institution?: string;
  type: string;
  currency: string;
  balanceCents: string;
}

export interface OpenFinanceTransaction {
  id: string;
  accountId: string;
  description: string;
  amountCents: string;
  type: 'income' | 'expense' | 'transfer';
  date: string;
}

export interface OpenFinanceConsent {
  id: string;
  externalId: string;
  status: string;
  expiresAt: Date;
}

export interface OpenFinanceProvider {
  listAccounts(): Promise<OpenFinanceAccount[]>;
  listTransactions(): Promise<OpenFinanceTransaction[]>;
  createConsent(userId?: string): Promise<OpenFinanceConsent>;
}

export const OPEN_FINANCE_PROVIDER = 'OPEN_FINANCE_PROVIDER';
