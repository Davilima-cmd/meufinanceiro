import { describe, expect, it } from 'vitest';
import { buildDemoSnapshot, DEMO_USER } from '@/lib/demo-data';
import {
  basisTotals,
  buildOverview,
  coverage,
  isSettled,
  spentByCategory,
  visibleAccounts,
} from '@/lib/analytics';
import { currentMonthKey, monthBounds, toCents } from '@/lib/format';

const snapshot = buildDemoSnapshot();

describe('dados de demonstração', () => {
  it('é determinístico para a mesma data', () => {
    const first = buildDemoSnapshot('2026-11-25');
    const second = buildDemoSnapshot('2026-11-25');
    expect(second.transactions).toEqual(first.transactions);
    expect(second.accounts).toEqual(first.accounts);
  });

  it('não gera lançamentos futuros no mês corrente', () => {
    const today = '2026-11-10';
    const data = buildDemoSnapshot(today);
    const currentMonth = data.transactions.filter((tx) => tx.date.slice(0, 7) === '2026-11');
    expect(currentMonth.length).toBeGreaterThan(0);
    for (const transaction of currentMonth) {
      expect(Number(transaction.date.slice(8, 10))).toBeLessThanOrEqual(10);
    }
  });

  it('mantém orçamentos no mês corrente', () => {
    const month = currentMonthKey();
    const { start } = monthBounds(month);
    expect(snapshot.budgets.every((budget) => budget.periodStart === start)).toBe(true);
  });

  it('respeita o modelo de compartilhamento', () => {
    const levels = new Set(snapshot.accounts.map((account) => account.shareLevel));
    expect(levels.has('private')).toBe(true);
    expect(levels.has('BALANCE_ONLY')).toBe(true);
    expect(levels.has('FULL')).toBe(true);
  });
});

describe('analytics', () => {
  const month = currentMonthKey();
  const ownerId = DEMO_USER.id;

  it('mostra histórico apenas das contas próprias ou compartilhadas como FULL', () => {
    const accounts = visibleAccounts(snapshot, ownerId);
    const { visible, hiddenAccounts } = coverage(snapshot.transactions, accounts);
    const liberadas = new Set(
      snapshot.accounts
        .filter((account) => account.ownerId === ownerId || account.shareLevel === 'FULL')
        .map((account) => account.id)
    );
    expect(hiddenAccounts).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(snapshot.transactions.length);
    expect(visible.every((transaction) => liberadas.has(transaction.accountId))).toBe(true);
  });

  it('oculta lançamentos de conta do parceiro com nível apenas saldo', () => {
    const partnerBalanceOnly = snapshot.accounts.find(
      (account) => account.ownerId !== ownerId && account.shareLevel === 'BALANCE_ONLY'
    );
    expect(partnerBalanceOnly).toBeDefined();
    const overview = buildOverview(snapshot, month, ownerId);
    expect(overview.visibleTransactions.some((tx) => tx.accountId === partnerBalanceOnly!.id)).toBe(
      false
    );
    expect(overview.netWorthCents).toBeGreaterThan(0n);
  });

  it('calcula receitas, despesas e resultado do mês', () => {
    const overview = buildOverview(snapshot, month, ownerId);
    expect(overview.incomeCents).toBeGreaterThan(0n);
    expect(overview.expenseCents).toBeGreaterThan(0n);
    expect(overview.netCents).toBe(overview.incomeCents - overview.expenseCents);
  });

  it('não soma transferências como despesa', () => {
    const overview = buildOverview(snapshot, month, ownerId);
    const transferencias = overview.visibleTransactions.filter((tx) => tx.type === 'transfer');
    const somaTransferencias = transferencias.reduce(
      (total, tx) => total + -toCents(tx.amountCents),
      0n
    );
    const semTransferencias = overview.categories.reduce((total, cat) => total + cat.cents, 0n);
    expect(somaTransferencias).toBeGreaterThan(0n);
    expect(semTransferencias).toBeLessThanOrEqual(overview.expenseCents);
  });

  it('soma o saldo consolidado das contas visíveis', () => {
    const overview = buildOverview(snapshot, month, ownerId);
    const personal = snapshot.accounts
      .filter((account) => account.ownerId === ownerId)
      .reduce((total, account) => total + toCents(account.balanceCents), 0n);
    expect(overview.personalBalanceCents).toBe(personal);
    expect(overview.netWorthCents).toBe(
      overview.personalBalanceCents + overview.sharedBalanceCents
    );
  });

  it('produz seis pontos de tendência mensal', () => {
    const overview = buildOverview(snapshot, month, ownerId);
    expect(overview.trend).toHaveLength(6);
    expect(overview.trend.at(-1)?.monthKey).toBe(month);
  });

  it('calcula gasto por categoria apenas de contas visíveis', () => {
    const spent = spentByCategory(snapshot, month, ownerId);
    const total = [...spent.values()].reduce((sum, value) => sum + value, 0n);
    const overview = buildOverview(snapshot, month, ownerId);
    expect(total).toBe(overview.categories.reduce((sum, category) => sum + category.cents, 0n));
  });
});

describe('analytics — realizado x projetado', () => {
  it('pendente não entra no realizado, mas aparece na projeção', () => {
    const base = buildDemoSnapshot('2026-11-25');
    const month = '2026-11';
    const account = base.accounts.find((item) => item.ownerId === DEMO_USER.id) ?? base.accounts[0];
    const pendente = {
      id: 'tx-pendente',
      accountId: account.id,
      categoryId: null,
      description: 'IPTU a pagar',
      amountCents: '-120000',
      type: 'expense' as const,
      origin: 'manual' as const,
      date: '2026-11-20',
      status: 'pending' as const,
      createdAt: '2026-11-20T10:00:00.000Z',
    };

    const antes = buildOverview(base, month, DEMO_USER.id);
    const depois = buildOverview(
      { ...base, transactions: [...base.transactions, pendente] },
      month,
      DEMO_USER.id
    );

    // O realizado não muda: pendente ainda não é dinheiro no caixa.
    expect(depois.expenseCents).toBe(antes.expenseCents);
    expect(depois.pendingExpenseCents).toBe(antes.pendingExpenseCents + 120000n);
    expect(depois.projectedNetCents).toBe(antes.projectedNetCents - 120000n);
    expect(depois.pendingTransactions.map((tx) => tx.id)).toContain('tx-pendente');
    expect(isSettled(pendente)).toBe(false);
  });

  it('cancelado não conta em nada', () => {
    const base = buildDemoSnapshot('2026-11-25');
    const month = '2026-11';
    const account = base.accounts[0];
    const cancelado = {
      id: 'tx-cancelado',
      accountId: account.id,
      categoryId: null,
      description: 'Compra desfeita',
      amountCents: '-50000',
      type: 'expense' as const,
      origin: 'manual' as const,
      date: '2026-11-20',
      status: 'canceled' as const,
      createdAt: '2026-11-20T10:00:00.000Z',
    };

    const antes = buildOverview(base, month, DEMO_USER.id);
    const depois = buildOverview(
      { ...base, transactions: [...base.transactions, cancelado] },
      month,
      DEMO_USER.id
    );

    expect(depois.expenseCents).toBe(antes.expenseCents);
    expect(depois.pendingExpenseCents).toBe(antes.pendingExpenseCents);
    expect(depois.projectedNetCents).toBe(antes.projectedNetCents);
  });
});

describe('basisTotals (caixa × competência)', () => {
  it('aluguel de dezembro pago em janeiro cai em meses diferentes', () => {
    const snapshot = {
      accounts: [
        {
          id: 'acc-1',
          name: 'Corrente',
          institution: null,
          type: 'checking' as const,
          currency: 'BRL',
          balanceCents: '0',
          shareLevel: 'private' as const,
          ownerId: 'user-1',
          ownerName: 'Davi',
          color: '#000',
          isActive: true,
        },
      ],
      categories: [],
      transactions: [
        {
          id: 'tx-1',
          accountId: 'acc-1',
          categoryId: null,
          description: 'Aluguel',
          amountCents: '-150000',
          type: 'expense' as const,
          origin: 'manual' as const,
          date: '2027-01-05',
          competenceDate: '2026-12-10',
          status: 'paid' as const,
          paidAt: '2027-01-05T12:00:00Z',
          createdAt: '2026-12-01T12:00:00Z',
        },
      ],
      budgets: [],
      goals: [],
      partner: null,
      settings: { theme: 'dark' as const, hideValues: false, partnerName: 'Parceiro' },
    };

    expect(basisTotals(snapshot, '2026-12', 'user-1', 'accrual').expenseCents).toBe(150000n);
    expect(basisTotals(snapshot, '2026-12', 'user-1', 'cash').expenseCents).toBe(0n);
    expect(basisTotals(snapshot, '2027-01', 'user-1', 'cash').expenseCents).toBe(150000n);
    expect(basisTotals(snapshot, '2027-01', 'user-1', 'accrual').expenseCents).toBe(0n);
  });
});
