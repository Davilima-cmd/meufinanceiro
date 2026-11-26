import { describe, expect, it, vi } from 'vitest';
import { PluggyOpenFinanceProvider } from '../src/open-finance/pluggy.provider';
import type { PluggyClient } from '../src/open-finance/pluggy.client';

/**
 * Provider Open Finance real (Pluggy).
 *
 * O cliente HTTP é substituído por um dublê: o que testamos é a tradução entre
 * o vocabulário do provedor e o do app — tipo de conta, sinal do lançamento e,
 * principalmente, reais decimais → centavos inteiros.
 */

function providerWith(
  client: Partial<PluggyClient>,
  connections: Array<Record<string, unknown>> = []
) {
  const prisma = {
    bankConnection: {
      findMany: vi.fn(async () => connections),
      findFirst: vi.fn(async () => connections[0] ?? null),
    },
  };
  const provider = new PluggyOpenFinanceProvider(prisma as never);
  // Substitui a fábrica do cliente para não tocar no ambiente/rede.
  (provider as unknown as { client: () => Partial<PluggyClient> }).client = () => client;
  return { provider, prisma };
}

const account = (overrides: Record<string, unknown> = {}) => ({
  id: 'acc-1',
  name: 'Conta Corrente',
  type: 'BANK' as const,
  subtype: 'CHECKING_ACCOUNT',
  balance: 120950.5,
  currencyCode: 'BRL',
  itemId: 'item-1',
  ...overrides,
});

describe('PluggyOpenFinanceProvider', () => {
  it('traduz reais do provedor em centavos inteiros', async () => {
    const { provider } = providerWith({ listAccounts: vi.fn(async () => [account()]) }, [
      { providerItemId: 'item-1' },
    ]);

    const [remote] = await provider.listAccounts('user-1');

    // 120950.5 reais → 12095050 centavos, sem resíduo de ponto flutuante.
    expect(remote.balanceCents).toBe('12095050');
  });

  it('mapeia BANK/subtype para os tipos do app', async () => {
    const { provider } = providerWith(
      {
        listAccounts: vi.fn(async () => [
          account({ id: 'a1', subtype: 'CHECKING_ACCOUNT' }),
          account({ id: 'a2', subtype: 'SAVINGS_ACCOUNT' }),
          account({ id: 'a3', subtype: 'INVESTMENT_ACCOUNT' }),
          account({ id: 'a4', type: 'CREDIT', subtype: 'CREDIT_CARD' }),
        ]),
      },
      [{ providerItemId: 'item-1' }]
    );

    const types = (await provider.listAccounts('user-1')).map((item) => item.type);

    expect(types).toEqual(['checking', 'savings', 'investment', 'credit']);
  });

  it('não lista nada sem item conectado (o vínculo nasce no widget)', async () => {
    const listAccounts = vi.fn(async () => [account()]);
    const { provider } = providerWith({ listAccounts }, []);
    expect(await provider.listAccounts('user-1')).toEqual([]);
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it('usa o sinal do valor para separar receita de despesa', async () => {
    const { provider } = providerWith(
      {
        listTransactions: vi.fn(async () => [
          { id: 't1', description: 'Mercado', amount: -152.3, date: '2026-11-10' },
          { id: 't2', description: 'Salário', amount: 4200, date: '2026-11-05' },
        ]),
      },
      [{ providerAccountId: 'acc-1', providerItemId: 'item-1' }]
    );

    const [expense, income] = await provider.listTransactions('account-1');

    expect(expense).toMatchObject({ amountCents: '-15230', type: 'expense' });
    expect(income).toMatchObject({ amountCents: '420000', type: 'income' });
  });

  it('classifica transferência quando a categoria do provedor indica', async () => {
    const { provider } = providerWith(
      {
        listTransactions: vi.fn(async () => [
          {
            id: 't3',
            description: 'Enviado',
            amount: -500,
            date: '2026-11-12',
            category: 'Transfer - PIX',
          },
        ]),
      },
      [{ providerAccountId: 'acc-1', providerItemId: 'item-1' }]
    );

    const [transfer] = await provider.listTransactions('account-1');
    expect(transfer.type).toBe('transfer');
  });

  it('propaga o status do item para a tela de conexão', async () => {
    const { provider } = providerWith({
      getItem: vi.fn(async () => ({
        id: 'item-1',
        status: 'UPDATING',
        executionStatus: 'SUCCESS',
      })),
    });

    expect(await provider.itemStatus('item-1')).toEqual({
      status: 'UPDATING',
      executionStatus: 'SUCCESS',
      clientUserId: null,
    });
  });

  it('nunca inventa consentimento sem itemId', async () => {
    const { provider } = providerWith({});
    await expect(provider.createConsent('user-1')).rejects.toThrow(/widget/i);
  });
});
