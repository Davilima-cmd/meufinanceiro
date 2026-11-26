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
  /**
   * Natureza do provedor. `sandbox` devolve dados fictícios e **não** pode
   * alimentar contas reais: em produção ele é recusado explicitamente, em vez
   * de criar uma conta com saldo inventado.
   */
  readonly kind: 'sandbox' | 'live';
  /** Contas disponíveis na instituição, para o usuário escolher o que vincular. */
  listAccounts(): Promise<OpenFinanceAccount[]>;
  listTransactions(): Promise<OpenFinanceTransaction[]>;
  createConsent(userId?: string): Promise<OpenFinanceConsent>;
}

export const OPEN_FINANCE_PROVIDER = 'OPEN_FINANCE_PROVIDER';
