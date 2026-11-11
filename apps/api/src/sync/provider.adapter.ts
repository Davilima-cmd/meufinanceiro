/**
 * Adaptador do provedor Open Finance.
 *
 * Isolado em uma interface para ser trocado pelo provedor real na Fase 4.
 * Nunca armazena senhas bancárias; apenas lê transações do provedor.
 */
export interface ProviderTransaction {
  /** Identificador original do provedor (usa para idempotência). */
  providerId: string;
  description: string;
  amountCents: number | string; // centavos, negativo para despesa
  type: 'income' | 'expense' | 'transfer';
  date: Date;
}

export abstract class BankProviderAdapter {
  abstract fetchTransactions(connection: {
    provider: string;
    providerAccountId: string;
  }): Promise<ProviderTransaction[]>;
}

/**
 * Adaptador de sandbox. Retorna transações fictícias e determinísticas,
 * derivadas da conta do provedor. Usado somente durante o desenvolvimento;
 * substituir pelo adaptador do provedor real antes de dados de produção.
 */
export class SandboxBankProviderAdapter extends BankProviderAdapter {
  async fetchTransactions(connection: {
    provider: string;
    providerAccountId: string;
  }): Promise<ProviderTransaction[]> {
    const seed = `${connection.provider}:${connection.providerAccountId}`;
    const hash = hashString(seed);
    const base = new Date(Date.UTC(2026, 10, 10, 10, 0, 0));

    return [
      {
        providerId: `prov_${seed}_1001`,
        description: 'Pagamento recebido (sandbox)',
        amountCents: 350000,
        type: 'income',
        date: new Date(base.getTime() + (hash % (3 * 24 * 60 * 60 * 1000))),
      },
      {
        providerId: `prov_${seed}_1002`,
        description: 'Supermercado (sandbox)',
        amountCents: -18745,
        type: 'expense',
        date: new Date(base.getTime() + ((hash * 7) % (3 * 24 * 60 * 60 * 1000))),
      },
      {
        providerId: `prov_${seed}_1003`,
        description: 'Transferência entre contas (sandbox)',
        amountCents: -50000,
        type: 'transfer',
        date: new Date(base.getTime() + ((hash * 13) % (3 * 24 * 60 * 60 * 1000))),
      },
    ];
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
