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

export type ProviderConnection = {
  provider: string;
  providerAccountId: string;
  /** Item/conexão no provedor; o Pluggy pagina lançamentos por conta, não por item. */
  providerItemId?: string | null;
};

export abstract class BankProviderAdapter {
  abstract fetchTransactions(connection: ProviderConnection): Promise<ProviderTransaction[]>;
}

/**
 * Adaptador do Pluggy (Open Finance real).
 *
 * O provedor devolve valor em reais (decimal); convertemos para centavos
 * inteiros aqui, no único ponto onde isso acontece. `providerId` é o id do
 * lançamento no provedor — é ele que garante a idempotência da reconciliação
 * (reexecutar não duplica).
 */
export class PluggyBankProviderAdapter extends BankProviderAdapter {
  async fetchTransactions(connection: ProviderConnection): Promise<ProviderTransaction[]> {
    const { PluggyClient } = await import('../open-finance/pluggy.client');
    const client = PluggyClient.fromEnv();
    const remote = await client.listTransactions(connection.providerAccountId);

    return remote.map((transaction) => {
      const cents = Math.round(Number(transaction.amount) * 100);
      const isTransfer = /transfer|ted|doc/i.test(
        transaction.category ?? transaction.description ?? ''
      );
      return {
        providerId: transaction.id,
        description: transaction.description?.trim() || 'Lançamento importado',
        amountCents: Number.isFinite(cents) ? cents : 0,
        type: isTransfer ? 'transfer' : cents >= 0 ? 'income' : 'expense',
        date: new Date(transaction.date),
      };
    });
  }
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
