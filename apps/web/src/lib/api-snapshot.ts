import {
  api,
  type ApiAccount,
  type ApiBudget,
  type ApiCategory,
  type ApiGoal,
  type ApiNetWorthSummary,
  type ApiSharedAccount,
  type ApiSharingOverview,
  type ApiTransaction,
} from './api';
import type {
  AccountType,
  FinanceAccount,
  FinanceSnapshot,
  FinancePartner,
  FinanceTransaction,
  FinanceUser,
  TransactionType,
} from './types';

/**
 * Converte a resposta da API (centavos em string, categorias/orçamentos
 * separados) no snapshot usado pela interface.
 *
 * O nível de compartilhamento vem da própria conta (`shareLevel`/`access`),
 * então conta do parceiro aparece com o dono certo e somente leitura — a
 * interface reflete o que a API já decidiu, em vez de adivinhar.
 */

function accountType(value: string): AccountType {
  // `wallet` é o nome antigo de "carteira" no banco; a interface usa `cash`.
  // Sem este mapeamento, conta importada/criada como wallet caía em `manual`.
  const aliases: Record<string, AccountType> = { wallet: 'cash' };
  if (aliases[value]) return aliases[value];
  const allowed: AccountType[] = ['checking', 'savings', 'credit', 'investment', 'cash', 'manual'];
  return allowed.includes(value as AccountType) ? (value as AccountType) : 'manual';
}

function transactionType(value: string): TransactionType {
  if (value === 'income' || value === 'transfer') return value;
  return 'expense';
}

const DEFAULT_COLORS = ['#8b7bff', '#22c55e', '#f97316', '#0ea5e9', '#ec4899', '#eab308'];

/**
 * Preferências locais do navegador que **não** existem na API (tema e
 * "esconder valores"). Sem elas aqui, cada snapshot remontado a partir da API
 * voltava para `dark`/`false` — bastava salvar um lançamento para a tela
 * "esquecer" o tema escolhido.
 */
export type StoredSettings = { theme?: 'dark' | 'light'; hideValues?: boolean };

function readStoredSettings(): StoredSettings {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('mf.settings.v1');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSettings;
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : undefined,
      hideValues: typeof parsed.hideValues === 'boolean' ? parsed.hideValues : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Espelha o `kind` da categoria.
 *
 * A API **aceita** `kind` no DTO de criação/edição, mas não guarda a coluna e
 * não devolve no `GET /categories` (histórico de migrations). Então, quando ela
 * manda, usamos; quando não manda, a heurística do nome é só o palpite de
 * último recurso — e um palpite errado esconde a categoria de receita da
 * seleção de receita.
 */
function categoryKind(category: ApiCategory & { kind?: string }): 'expense' | 'income' | 'both' {
  if (category.kind === 'income' || category.kind === 'expense' || category.kind === 'both') {
    return category.kind;
  }
  return /salário|salario|receita|rendimento|freelance|proventos|reembolso|venda/i.test(
    category.name
  )
    ? 'income'
    : 'expense';
}

/**
 * O parceiro vem da parceria (aceita ou ainda pendente). Sem parceria na API,
 * cai no dono das contas compartilhadas — se houver mais de um, fica o primeiro.
 */
function partnerFromSnapshot(
  accounts: ApiAccount[],
  user: FinanceUser,
  overview: ApiSharingOverview | null
): FinancePartner | null {
  if (overview?.partner) {
    return {
      id: overview.partner.id,
      name: overview.partner.name,
      email: '',
      // Convite pendente aparece na tela como "aguardando", não como vínculo ativo.
      status: overview.partnership?.status === 'accepted' ? 'accepted' : 'pending',
    };
  }
  const shared = accounts.find((account) => account.ownerId && account.ownerId !== user.id);
  if (!shared?.ownerId) return null;
  return {
    id: shared.ownerId,
    name: shared.ownerName ?? 'Parceiro',
    email: '',
    status: 'accepted',
  };
}

export function mapApiSnapshot(
  user: FinanceUser,
  accounts: ApiAccount[],
  transactions: ApiTransaction[],
  categories: ApiCategory[],
  budgets: ApiBudget[],
  goals: ApiGoal[],
  sharing: ApiSharingOverview | null = null
): FinanceSnapshot {
  const storedSettings = readStoredSettings();
  const mappedCategories = categories.map((category, index) => {
    const kind = categoryKind(category as ApiCategory & { kind?: string });
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

  // O nível da conta vem da visão de compartilhamento (fonte do dono) quando
  // disponível: a lista de contas pode vir de um cache anterior à mudança.
  const levelByAccount = new Map((sharing?.accounts ?? []).map((row) => [row.id, row.level]));

  return {
    accounts: accounts.map((account, index) => {
      const isMine = !account.ownerId || account.ownerId === user.id;
      return {
        id: account.id,
        name: account.name,
        institution: account.institution ?? null,
        type: accountType(account.type),
        currency: account.currency || 'BRL',
        balanceCents: String(account.balanceCents),
        shareLevel: levelByAccount.get(account.id) ?? account.shareLevel ?? 'private',
        ownerId: account.ownerId ?? user.id,
        ownerName: account.ownerName ?? user.name,
        access: account.access,
        color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        isActive: account.isActive,
        isMine,
      };
    }),
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
    partner: partnerFromSnapshot(accounts, user, sharing),
    invites: sharing?.invites ?? [],
    settings: {
      theme: storedSettings.theme ?? 'dark',
      hideValues: storedSettings.hideValues ?? false,
      partnerName: partnerFromSnapshot(accounts, user, sharing)?.name ?? 'Parceiro',
    },
  };
}

/**
 * Contas que o parceiro compartilhou, vindas do endpoint dedicado
 * (`GET /sharing/accounts`).
 *
 * A lista usa o mesmo `level`/`access` que a API decidiu, em vez de o front
 * deduzir permissão — é isso que impede a tela de oferecer uma ação que o
 * servidor vai recusar.
 */
export function mapSharedAccounts(rows: ApiSharedAccount[], offset = 0): FinanceAccount[] {
  return rows.map((row, index) => ({
    id: row.account.id,
    name: row.account.name,
    institution: row.account.institution ?? null,
    // A conta do parceiro é a mesma conta que ele criou: forçar `manual`
    // apagava o tipo real (corrente, cartão, investimento) na visão de quem
    // recebeu o compartilhamento.
    type: row.account.type ? accountType(row.account.type) : 'manual',
    currency: 'BRL',
    balanceCents: String(row.account.balanceCents),
    shareLevel: row.level,
    ownerId: row.owner.id,
    ownerName: row.owner.name,
    access: {
      canSeeBalance: row.canSeeBalance,
      canSeeTransactions: row.canSeeTransactions,
      readOnly: row.readOnly,
    },
    color: DEFAULT_COLORS[(offset + index) % DEFAULT_COLORS.length],
    isActive: row.account.isActive,
    isMine: false,
  }));
}

export async function fetchApiSnapshot(): Promise<FinanceSnapshot> {
  const [accounts, transactions, categories, budgets, goals, sharing, sharedAccounts, netWorth] =
    await Promise.all([
      api.getAccounts(),
      api.getTransactions(),
      api.getCategories(),
      api.getBudgets().catch(() => [] as ApiBudget[]),
      api.getGoals().catch(() => [] as ApiGoal[]),
      // Compartilhamento é complementar: falhar aqui não pode derrubar a tela.
      api.getSharing().catch(() => null),
      // Fonte própria das contas recebidas: garante que elas aparecem mesmo se
      // `GET /accounts` falhar ou vier de um cache antigo.
      api.getSharedAccounts().catch(() => [] as ApiSharedAccount[]),
      // Patrimônio é complementar: sem ele a tela mostra só o saldo das contas.
      api.getNetWorth().catch(() => null as ApiNetWorthSummary | null),
    ]);
  // O usuário vem do `GET /auth/status` (dono da verdade): a cópia no
  // `localStorage` pode estar velha ou ausente, e o id errado faria o app tratar
  // as próprias contas como compartilhadas (somente leitura).
  const status = await api.authStatus().catch(() => null);
  const stored = localStorage.getItem('mf.session.api');
  const parsed = stored ? (JSON.parse(stored) as { user?: { id: string; name: string } }) : null;
  const user: FinanceUser = {
    id: status?.user.id ?? parsed?.user?.id ?? 'api-user',
    name: status?.user.name ?? parsed?.user?.name ?? 'Você',
    email: status?.user.email ?? '',
  };
  // Une as duas fontes: `GET /accounts` já traz as compartilhadas, mas o
  // endpoint dedicado é a verdade sobre nível e permissão. Quem vem de lá
  // sobrescreve o item equivalente.
  const received = mapSharedAccounts(sharedAccounts.filter((row) => row.level !== 'private'));
  const receivedById = new Map(received.map((account) => [account.id, account]));
  const allAccounts = accounts.map((account) => receivedById.get(account.id) ?? account);
  for (const account of received) {
    if (!allAccounts.some((item) => item.id === account.id)) allAccounts.push(account);
  }

  const snapshot = mapApiSnapshot(
    user,
    allAccounts as typeof accounts,
    transactions,
    categories,
    budgets,
    goals,
    sharing
  );

  return { ...snapshot, netWorthItems: netWorth?.items ?? [] };
}
