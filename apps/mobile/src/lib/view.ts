import type { Snapshot } from './api';

/** Lançamento no formato que as telas do app consomem. */
export type DemoTransaction = {
  id: string;
  description: string;
  category: string;
  date: string;
  amountCents: bigint;
};

export type FinanceView = {
  transactions: DemoTransaction[];
  accounts: Array<{ name: string; kind: string; cents: bigint; share: string }>;
  categories: Array<{ name: string; cents: bigint; percent: number }>;
  balanceCents: bigint;
  incomeCents: bigint;
  expenseCents: bigint;
};

/**
 * Traduz o snapshot da API para o formato das telas.
 *
 * Tudo o que aparece na tela conectada vem daqui — nada de número fixo. Quando
 * o app está em demonstração, as constantes acima continuam valendo.
 */
export function buildView(snapshot: Snapshot | null) {
  if (!snapshot) return null;
  const categoryById = new Map(snapshot.categories.map((item) => [item.id, item.name]));

  const transactions: DemoTransaction[] = snapshot.transactions
    .slice()
    .sort((left, right) => (left.date < right.date ? 1 : -1))
    .map((item) => ({
      id: item.id,
      description: item.description,
      category: item.categoryId
        ? (categoryById.get(item.categoryId) ?? 'Sem categoria')
        : 'Sem categoria',
      date: item.date.slice(0, 10).split('-').reverse().join('/'),
      amountCents: BigInt(item.amountCents),
    }));

  const accounts = snapshot.accounts.map((item) => ({
    name: item.name,
    kind: item.institution ?? 'Conta manual',
    cents: BigInt(item.balanceCents),
    share: item.shareLevel === 'private' ? 'Privada' : 'Compartilhada (somente leitura)',
  }));

  const byCategory = new Map<string, bigint>();
  for (const item of transactions) {
    if (item.amountCents >= 0n) continue;
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0n) + -item.amountCents);
  }
  const total = [...byCategory.values()].reduce((sum, value) => sum + value, 0n);
  const categories = [...byCategory.entries()]
    .sort((left, right) => (right[1] > left[1] ? 1 : -1))
    .map(([name, cents]) => ({
      name,
      cents,
      percent: total > 0n ? Math.round((Number(cents) / Number(total)) * 100) : 0,
    }));

  const balanceCents = accounts.reduce((sum, account) => sum + account.cents, 0n);
  const incomeCents = transactions
    .filter((item) => item.amountCents > 0n)
    .reduce((sum, item) => sum + item.amountCents, 0n);
  const expenseCents = -transactions
    .filter((item) => item.amountCents < 0n)
    .reduce((sum, item) => sum + item.amountCents, 0n);

  return { transactions, accounts, categories, balanceCents, incomeCents, expenseCents };
}
