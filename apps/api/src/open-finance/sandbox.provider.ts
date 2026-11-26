import { Injectable } from '@nestjs/common';
import {
  OpenFinanceAccount,
  OpenFinanceConsent,
  OpenFinanceProvider,
  OpenFinanceTransaction,
} from './open-finance.provider';

const NOW = new Date('2026-11-01T00:00:00-03:00');

const ACCOUNTS: OpenFinanceAccount[] = [
  {
    id: 'sandbox-account-1',
    name: 'Conta Corrente Sandbox',
    institution: 'Sandbox Bank',
    type: 'checking',
    currency: 'BRL',
    balanceCents: '543210',
  },
  {
    id: 'sandbox-account-2',
    name: 'Poupança Sandbox',
    institution: 'Sandbox Bank',
    type: 'savings',
    currency: 'BRL',
    balanceCents: '1200000',
  },
];

const TRANSACTIONS: OpenFinanceTransaction[] = [
  {
    id: 'sandbox-tx-1',
    accountId: 'sandbox-account-1',
    description: 'Pix recebido - Salário',
    amountCents: '500000',
    type: 'income',
    date: new Date(NOW.getTime() - 2 * 86400000).toISOString(),
  },
  {
    id: 'sandbox-tx-2',
    accountId: 'sandbox-account-1',
    description: 'Supermercado',
    amountCents: '-18740',
    type: 'expense',
    date: new Date(NOW.getTime() - 86400000).toISOString(),
  },
  {
    id: 'sandbox-tx-3',
    accountId: 'sandbox-account-2',
    description: 'Transferência para poupança',
    amountCents: '-100000',
    type: 'transfer',
    date: NOW.toISOString(),
  },
];

@Injectable()
export class SandboxOpenFinanceProvider implements OpenFinanceProvider {
  readonly kind = 'sandbox' as const;

  async listAccounts(): Promise<OpenFinanceAccount[]> {
    return ACCOUNTS;
  }

  async listTransactions(): Promise<OpenFinanceTransaction[]> {
    return TRANSACTIONS;
  }

  async createConsent(): Promise<OpenFinanceConsent> {
    const externalId = `sandbox_consent_${crypto.randomUUID()}`;
    return {
      id: `sandbox_consent_record_${crypto.randomUUID()}`,
      externalId,
      status: 'active',
      expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}
