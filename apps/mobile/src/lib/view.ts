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

  /**
   * Lançamentos que entram nos totais.
   *
   * Três coisas ficavam de fora ou entravam erradas:
   * - **transferência** entre contas do usuário não é receita nem despesa: era
   *   somada como entrada na conta de destino e saída na de origem, inflando os
   *   dois lados do mês. A saída continua aparecendo na lista (é o histórico),
   *   mas fica fora dos totais;
   * - **pendente** (a pagar/receber) não é caixa ainda: contava como dinheiro
   *   que entrou/saiu e o saldo do mês não fechava com o extrato;
   * - **cancelado** nunca aconteceu.
   */
  const isTransfer = (item: { type: string; transferId?: string | null }) =>
    item.type === 'transfer' || Boolean(item.transferId);
  const isCash = (item: { status: string }) => item.status === 'paid';

  const transactions: DemoTransaction[] = snapshot.transactions
    .slice()
    .sort((left, right) => (left.date < right.date ? 1 : -1))
    .map((item) => ({
      id: item.id,
      description: item.description,
      category: isTransfer(item)
        ? 'Transferência'
        : item.categoryId
          ? (categoryById.get(item.categoryId) ?? 'Sem categoria')
          : 'Sem categoria',
      date: item.date.slice(0, 10).split('-').reverse().join('/'),
      amountCents: BigInt(item.amountCents),
    }));

  // Base dos totais: só caixa de verdade, sem transferência entre contas.
  const settled = snapshot.transactions.filter(
    (item) => isCash(item) && !isTransfer(item) && item.status !== 'canceled'
  );

  const accounts = snapshot.accounts.map((item) => ({
    name: item.name,
    kind: item.institution ?? 'Conta manual',
    cents: BigInt(item.balanceCents),
    share: item.shareLevel === 'private' ? 'Privada' : 'Compartilhada (somente leitura)',
  }));

  const byCategory = new Map<string, bigint>();
  for (const item of settled) {
    const cents = BigInt(item.amountCents);
    if (cents >= 0n) continue;
    const name = item.categoryId
      ? (categoryById.get(item.categoryId) ?? 'Sem categoria')
      : 'Sem categoria';
    byCategory.set(name, (byCategory.get(name) ?? 0n) + -cents);
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
  let incomeCents = 0n;
  let expenseCents = 0n;
  for (const item of settled) {
    const cents = BigInt(item.amountCents);
    // O sinal vem do valor, não do texto de `type`: é o mesmo critério da API
    // na hora de aplicar saldo, e um `type` divergente não desalinha a tela.
    if (cents > 0n) incomeCents += cents;
    else if (cents < 0n) expenseCents += -cents;
  }

  return { transactions, accounts, categories, balanceCents, incomeCents, expenseCents };
}
