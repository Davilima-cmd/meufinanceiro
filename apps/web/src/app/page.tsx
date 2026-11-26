'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { BalanceSparkline, Donut, FlowChart } from '@/components/charts';
import { TransactionDialog } from '@/components/transaction-dialog';
import { Badge, Card, Money, PageHeader, ProgressBar } from '@/components/ui';
import { buildOverview } from '@/lib/analytics';
import {
  currentMonthKey,
  daysUntil,
  formatMonth,
  formatRelativeDay,
  shiftMonth,
  toCents,
} from '@/lib/format';
import { useFinance } from '@/lib/store';

export default function DashboardPage() {
  const { snapshot, session } = useFinance();
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [dialogOpen, setDialogOpen] = useState(false);

  const ownerId = session?.user.id ?? '';
  const overview = useMemo(
    () => buildOverview(snapshot, monthKey, ownerId),
    [snapshot, monthKey, ownerId]
  );

  const monthTransactions = overview.visibleTransactions;
  const categoryById = useMemo(
    () => new Map(snapshot.categories.map((category) => [category.id, category])),
    [snapshot.categories]
  );
  const accountById = useMemo(
    () => new Map(snapshot.accounts.map((account) => [account.id, account])),
    [snapshot.accounts]
  );

  // O saldo acumulado é caixa: pendente só entra na projeção, não na linha do tempo.
  const settledTransactions = useMemo(
    () => monthTransactions.filter((transaction) => (transaction.status ?? 'paid') === 'paid'),
    [monthTransactions]
  );

  const runningBalance = useMemo(() => {
    const sorted = [...settledTransactions].reverse();
    // reduce acumula o saldo sem reatribuir variáveis durante o render.
    return sorted.reduce<bigint[]>((acc, transaction) => {
      const previous = acc.length > 0 ? acc[acc.length - 1] : 0n;
      acc.push(previous + toCents(transaction.amountCents));
      return acc;
    }, []);
  }, [settledTransactions]);

  const hiddenTransactions = snapshot.accounts.filter(
    (account) => account.shareLevel !== 'FULL'
  ).length;

  const upcomingGoal = overview.goals[0] ?? null;
  const goalRecord = upcomingGoal
    ? snapshot.goals.find((goal) => goal.id === upcomingGoal.id)
    : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Visão geral"
        title={`Olá, ${session?.user.name.split(' ')[0] ?? 'tudo bem'}!`}
        description="Saldo consolidado das contas do casal, gastos do mês e o que está por vir."
        actions={
          <>
            <div className="segmented" aria-label="Selecionar mês">
              <button
                aria-label="Mês anterior"
                onClick={() => setMonthKey((value) => shiftMonth(value, -1))}
                type="button"
              >
                ←
              </button>
              <button className="is-selected" type="button">
                {formatMonth(monthKey)}
              </button>
              <button
                aria-label="Próximo mês"
                disabled={monthKey >= currentMonthKey()}
                onClick={() => setMonthKey((value) => shiftMonth(value, 1))}
                type="button"
              >
                →
              </button>
            </div>
            <button
              className="button button-primary"
              onClick={() => setDialogOpen(true)}
              type="button"
            >
              + Novo lançamento
            </button>
          </>
        }
      />

      <div className="stack">
        <section className="hero">
          <div className="hero-balance">
            <span className="label">Saldo consolidado (contas visíveis)</span>
            <span className="value">
              <Money value={overview.netWorthCents} />
            </span>
            <div className="meta">
              <span>
                Suas contas{' '}
                <strong>
                  <Money value={overview.personalBalanceCents} />
                </strong>
              </span>
              <span>
                Contas do parceiro{' '}
                <strong>
                  <Money value={overview.sharedBalanceCents} />
                </strong>
              </span>
            </div>
            <BalanceSparkline points={runningBalance.length > 1 ? runningBalance : [0n, 0n]} />
          </div>
          <div className="hero-side">
            <div className="mini-stat">
              <span>Entradas do mês</span>
              <strong className="text-positive">
                <Money value={overview.incomeCents} />
              </strong>
            </div>
            <div className="mini-stat">
              <span>Saídas do mês</span>
              <strong className="text-negative">
                <Money value={overview.expenseCents} />
              </strong>
            </div>
            <div className="mini-stat">
              <span>Resultado do mês</span>
              <strong className={overview.netCents >= 0n ? 'text-positive' : 'text-negative'}>
                <Money value={overview.netCents} signed />
              </strong>
            </div>
            <div className="mini-stat">
              <span>A pagar/receber</span>
              <strong>
                <Money value={overview.pendingIncomeCents - overview.pendingExpenseCents} signed />
              </strong>
              <small className="text-muted">
                projetado: <Money value={overview.projectedNetCents} signed />
              </small>
            </div>
            <div className="mini-stat">
              <span>Taxa de sobra</span>
              <strong>{overview.savingsRate}%</strong>
            </div>
          </div>
        </section>

        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Gasto no mês</span>
            <strong className="stat-value is-negative">
              <Money value={overview.expenseCents} />
            </strong>
            <span className="stat-hint">
              {overview.expenseChange === null
                ? 'Sem base de comparação'
                : `${overview.expenseChange > 0 ? '+' : ''}${overview.expenseChange}% vs. mês anterior`}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Lançamentos</span>
            <strong className="stat-value">{overview.transactionCount}</strong>
            <span className="stat-hint">
              {hiddenTransactions > 0
                ? `${hiddenTransactions} conta(s) com apenas saldo visível`
                : 'Todas as contas com histórico completo'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Maior despesa</span>
            <strong className="stat-value">
              {overview.biggestExpense ? (
                <Money value={overview.biggestExpense.amountCents} />
              ) : (
                '—'
              )}
            </strong>
            <span className="stat-hint">
              {overview.biggestExpense?.description ?? 'Nenhuma despesa no período'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Orçamentos no limite</span>
            <strong className="stat-value">
              {overview.pendingBudgets.filter((budget) => budget.percent >= 80).length}
            </strong>
            <span className="stat-hint">
              {overview.pendingBudgets.length === 0
                ? 'Nenhum orçamento definido'
                : `${overview.pendingBudgets.length} orçamento(s) ativo(s)`}
            </span>
          </div>
        </div>

        <div className="grid grid-2">
          <Card>
            <div className="card-heading">
              <div>
                <h2>Entradas e saídas</h2>
                <p>Últimos 6 meses de movimento consolidado</p>
              </div>
              <Badge tone="accent">6 meses</Badge>
            </div>
            <FlowChart data={overview.trend} />
          </Card>

          <Card>
            <div className="card-heading">
              <div>
                <h2>Onde o dinheiro foi</h2>
                <p>Despesas de {formatMonth(monthKey)} por categoria</p>
              </div>
            </div>
            {overview.categories.length === 0 ? (
              <p className="text-muted">Nenhuma despesa registrada neste mês.</p>
            ) : (
              <div className="category-panel">
                <Donut
                  data={overview.categories.slice(0, 6).map((category) => ({
                    label: category.name,
                    cents: category.cents,
                    color: category.color,
                  }))}
                />
                <div className="category-legend">
                  {overview.categories.slice(0, 6).map((category) => (
                    <div className="legend-row" key={category.id}>
                      <span className="legend-name">
                        <i className="dot-color" style={{ background: category.color }} />
                        <span>{category.name}</span>
                      </span>
                      <strong>
                        <Money value={category.cents} />
                      </strong>
                      <ProgressBar color={category.color} percent={category.share} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-2">
          <Card>
            <div className="card-heading">
              <div>
                <h2>Lançamentos recentes</h2>
                <p>Movimentações das contas com histórico liberado</p>
              </div>
              <Link className="link-button" href="/lancamentos">
                Ver todos
              </Link>
            </div>
            {monthTransactions.length === 0 ? (
              <p className="text-muted">Nenhum lançamento neste mês.</p>
            ) : (
              <ul className="list">
                {[...monthTransactions]
                  .sort((left, right) => (left.date < right.date ? 1 : -1))
                  .slice(0, 6)
                  .map((transaction) => {
                    const cents = toCents(transaction.amountCents);
                    const category = transaction.categoryId
                      ? categoryById.get(transaction.categoryId)
                      : null;
                    return (
                      <li className="list-row" key={transaction.id}>
                        <span
                          aria-hidden="true"
                          className="row-mark"
                          style={{
                            background: category ? `${category.color}22` : 'var(--surface-3)',
                            color: category?.color ?? 'var(--muted)',
                          }}
                        >
                          {transaction.description.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="row-copy">
                          <strong>{transaction.description}</strong>
                          <small>
                            {category?.name ?? 'Sem categoria'} ·{' '}
                            {accountById.get(transaction.accountId)?.name ?? 'Conta'}
                          </small>
                        </span>
                        <span className="row-end">
                          <span className={`row-amount ${cents > 0n ? 'text-positive' : ''}`}>
                            <Money value={cents} signed />
                          </span>
                          <small className="row-date">
                            {transaction.status === 'pending' ? 'pendente · ' : ''}
                            {formatRelativeDay(transaction.date)}
                          </small>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>

          <div className="stack">
            <Card>
              <div className="card-heading">
                <div>
                  <h2>Orçamentos em atenção</h2>
                  <p>Uso do limite no mês</p>
                </div>
                <Link className="link-button" href="/orcamentos">
                  Gerenciar
                </Link>
              </div>
              {overview.pendingBudgets.length === 0 ? (
                <p className="text-muted">Nenhum orçamento para este mês.</p>
              ) : (
                <div className="category-legend">
                  {overview.pendingBudgets.slice(0, 4).map((budget) => (
                    <div className="legend-row" key={budget.id}>
                      <span className="legend-name">
                        <i className="dot-color" style={{ background: budget.color }} />
                        <span>{budget.name}</span>
                      </span>
                      <strong className={budget.percent >= 100 ? 'text-negative' : ''}>
                        {budget.percent}%
                      </strong>
                      <ProgressBar
                        percent={budget.percent}
                        tone={budget.percent >= 100 ? 'negative' : undefined}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="card-heading">
                <div>
                  <h2>Próxima meta</h2>
                  <p>Progresso acumulado</p>
                </div>
                <Link className="link-button" href="/metas">
                  Ver metas
                </Link>
              </div>
              {goalRecord && upcomingGoal ? (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="goal-head">
                    <strong>{goalRecord.name}</strong>
                    <Badge tone={upcomingGoal.percent >= 100 ? 'positive' : 'accent'}>
                      {upcomingGoal.percent}%
                    </Badge>
                  </div>
                  <ProgressBar
                    percent={upcomingGoal.percent}
                    tone={upcomingGoal.percent >= 100 ? 'positive' : undefined}
                  />
                  <div className="goal-amounts">
                    <strong>
                      <Money value={goalRecord.currentCents} />
                    </strong>
                    de <Money value={goalRecord.targetCents} />
                  </div>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {goalRecord.dueDate
                      ? `Faltam ${Math.max(daysUntil(goalRecord.dueDate), 0)} dias para o prazo`
                      : 'Sem prazo definido'}
                  </span>
                </div>
              ) : (
                <p className="text-muted">Nenhuma meta cadastrada ainda.</p>
              )}
            </Card>
          </div>
        </div>
      </div>

      <TransactionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </AppShell>
  );
}
