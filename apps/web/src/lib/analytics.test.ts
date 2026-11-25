import { describe, expect, it } from 'vitest';
import { buildDemoSnapshot, DEMO_USER } from '@/lib/demo-data';
import { buildOverview, coverage, spentByCategory, visibleAccounts } from '@/lib/analytics';
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
