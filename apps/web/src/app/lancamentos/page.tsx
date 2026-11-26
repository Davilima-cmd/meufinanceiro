'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Select, useDialog } from '@/components/dialog';
import { TransactionDialog } from '@/components/transaction-dialog';
import { Badge, Card, EmptyState, Money, PageHeader } from '@/components/ui';
import { coverage, visibleAccounts } from '@/lib/analytics';
import {
  currentMonthKey,
  formatAmount,
  formatDay,
  formatMonth,
  monthKeyOf,
  shiftMonth,
  sumCents,
  toCents,
  todayISO,
} from '@/lib/format';
import { useFinance } from '@/lib/store';
import type { TransactionType } from '@/lib/types';

type Filter = 'all' | TransactionType;
/** Filtro por situação: o que já é caixa, o que ainda vai ser, e o que foi cancelado. */
type StatusFilter = 'all' | 'settled' | 'pending' | 'canceled';

const PAGE_SIZE = 20;

export default function TransactionsPage() {
  const { snapshot, session, deleteTransaction, settleTransaction, cancelTransaction } =
    useFinance();
  const dialog = useDialog();
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [filter, setFilter] = useState<Filter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [dialogOpen, setDialogOpen] = useState(false);

  const accounts = useMemo(
    () => visibleAccounts(snapshot, session?.user.id ?? ''),
    [snapshot, session?.user.id]
  );
  const { visible, hiddenAccounts } = useMemo(
    () => coverage(snapshot.transactions, accounts),
    [snapshot.transactions, accounts]
  );
  const accountById = useMemo(
    () => new Map(snapshot.accounts.map((account) => [account.id, account])),
    [snapshot.accounts]
  );
  const categoryById = useMemo(
    () => new Map(snapshot.categories.map((category) => [category.id, category])),
    [snapshot.categories]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visible
      .filter((transaction) => monthKeyOf(transaction.date) === monthKey)
      .filter((transaction) => (filter === 'all' ? true : transaction.type === filter))
      .filter((transaction) => {
        const status = transaction.status ?? 'paid';
        if (statusFilter === 'all') return status !== 'canceled';
        if (statusFilter === 'settled') return status === 'paid';
        if (statusFilter === 'pending') return status === 'pending';
        return status === 'canceled';
      })
      .filter((transaction) =>
        accountFilter === 'all' ? true : transaction.accountId === accountFilter
      )
      .filter((transaction) => {
        if (!term) return true;
        const category = transaction.categoryId ? categoryById.get(transaction.categoryId) : null;
        return (
          transaction.description.toLowerCase().includes(term) ||
          (category?.name.toLowerCase().includes(term) ?? false)
        );
      })
      .sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0));
  }, [visible, monthKey, filter, statusFilter, accountFilter, search, categoryById]);

  const totals = useMemo(() => {
    // Só o que já virou caixa entra nos totais; pendente tem seu próprio número.
    const settled = filtered.filter((transaction) => (transaction.status ?? 'paid') === 'paid');
    const income = sumCents(
      settled
        .filter((transaction) => toCents(transaction.amountCents) > 0n)
        .map((t) => t.amountCents)
    );
    const expense = -sumCents(
      settled
        .filter((transaction) => toCents(transaction.amountCents) < 0n)
        .map((t) => t.amountCents)
    );
    const pending = sumCents(
      filtered
        .filter((transaction) => transaction.status === 'pending')
        .map((t) => -toCents(t.amountCents))
    );
    return { income, expense, net: income - expense, pending };
  }, [filtered]);

  function exportCsv() {
    const header = ['Data', 'Descrição', 'Categoria', 'Conta', 'Tipo', 'Valor (centavos)'];
    const lines = filtered.map((transaction) => {
      const category = transaction.categoryId
        ? (categoryById.get(transaction.categoryId)?.name ?? '')
        : '';
      const account = accountById.get(transaction.accountId)?.name ?? '';
      return [
        transaction.date,
        transaction.description,
        category,
        account,
        transaction.type,
        transaction.amountCents,
      ]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lancamentos-${monthKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Movimentações"
        title="Lançamentos"
        description="Entradas, saídas e transferências de todas as contas com histórico liberado."
        actions={
          <>
            <div className="segmented" aria-label="Selecionar mês">
              <button
                aria-label="Mês anterior"
                onClick={() => {
                  setMonthKey((value) => shiftMonth(value, -1));
                  setLimit(PAGE_SIZE);
                }}
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
                onClick={() => {
                  setMonthKey((value) => shiftMonth(value, 1));
                  setLimit(PAGE_SIZE);
                }}
                type="button"
              >
                →
              </button>
            </div>
            <button className="button button-ghost" onClick={exportCsv} type="button">
              Exportar CSV
            </button>
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
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Entradas</span>
            <strong className="stat-value is-positive">
              <Money value={totals.income} />
            </strong>
            <span className="stat-hint">{filtered.length} lançamento(s) filtrado(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Saídas</span>
            <strong className="stat-value is-negative">
              <Money value={totals.expense} />
            </strong>
          </div>
          <div className="stat">
            <span className="stat-label">Resultado</span>
            <strong className={`stat-value ${totals.net >= 0n ? 'is-positive' : 'is-negative'}`}>
              <Money value={totals.net} signed />
            </strong>
            <span className="stat-hint">só o que já passou pelo caixa</span>
          </div>
          <div className="stat">
            <span className="stat-label">A pagar/receber</span>
            <strong className="stat-value">
              <Money value={-totals.pending} signed />
            </strong>
            <span className="stat-hint">ainda não afeta o saldo</span>
          </div>
        </div>

        <Card>
          <div className="filter-bar">
            <input
              aria-label="Buscar lançamento"
              className="input search-input"
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="Buscar por descrição ou categoria…"
              value={search}
            />
            <Select
              className="filter-select"
              label="Filtrar por conta"
              onChange={(next) => {
                setAccountFilter(next);
                setLimit(PAGE_SIZE);
              }}
              options={[
                { value: 'all', label: 'Todas as contas' },
                ...snapshot.accounts.map((account) => ({
                  value: account.id,
                  label: account.name,
                  color: account.color,
                })),
              ]}
              value={accountFilter}
            />
            <Select
              className="filter-select"
              label="Filtrar por situação"
              onChange={(next) => {
                setStatusFilter(next as StatusFilter);
                setLimit(PAGE_SIZE);
              }}
              options={[
                { value: 'all', label: 'Todas as situações' },
                { value: 'settled', label: 'Liquidados' },
                { value: 'pending', label: 'A pagar/receber' },
                { value: 'canceled', label: 'Cancelados' },
              ]}
              value={statusFilter}
            />
            <div className="page-actions">
              {(
                [
                  { value: 'all', label: 'Tudo' },
                  { value: 'expense', label: 'Despesas' },
                  { value: 'income', label: 'Receitas' },
                  { value: 'transfer', label: 'Transferências' },
                ] as const
              ).map((option) => (
                <button
                  className={`chip-toggle ${filter === option.value ? 'is-active' : ''}`}
                  key={option.value}
                  onClick={() => {
                    setFilter(option.value);
                    setLimit(PAGE_SIZE);
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {hiddenAccounts > 0 ? (
            <p className="auth-note" style={{ marginBottom: 12 }}>
              {hiddenAccounts} conta(s) compartilhada(s) com nível “somente saldo” não mostram
              lançamentos. Ajuste o nível em <strong>Casal</strong>.
            </p>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState
              action={
                <button
                  className="button button-primary"
                  onClick={() => setDialogOpen(true)}
                  type="button"
                >
                  Registrar primeiro lançamento
                </button>
              }
              description="Ajuste os filtros ou registre uma nova movimentação para este mês."
              title="Nenhum lançamento encontrado"
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Conta</th>
                      <th className="num">Valor</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, limit).map((transaction) => {
                      const cents = toCents(transaction.amountCents);
                      const category = transaction.categoryId
                        ? categoryById.get(transaction.categoryId)
                        : null;
                      const account = accountById.get(transaction.accountId);
                      const status = transaction.status ?? 'paid';
                      const due = transaction.dueDate ?? transaction.date;
                      const overdue = status === 'pending' && due < todayISO();
                      return (
                        <tr key={transaction.id}>
                          <td>{formatDay(transaction.date)}</td>
                          <td>
                            <strong style={{ fontWeight: 600 }}>{transaction.description}</strong>
                            {transaction.origin === 'imported' ? (
                              <>
                                {' '}
                                <Badge tone="accent">auto</Badge>
                              </>
                            ) : null}
                            {status === 'pending' ? (
                              <>
                                {' '}
                                <Badge tone="warning">
                                  {overdue ? 'atrasado' : 'a pagar/receber'}
                                </Badge>
                              </>
                            ) : null}
                            {status === 'canceled' ? (
                              <>
                                {' '}
                                <Badge tone="neutral">cancelado</Badge>
                              </>
                            ) : null}
                          </td>
                          <td>
                            {category ? (
                              <span className="legend-name">
                                <i className="dot-color" style={{ background: category.color }} />
                                <span>{category.name}</span>
                              </span>
                            ) : (
                              <span className="text-muted">Sem categoria</span>
                            )}
                          </td>
                          <td>
                            {account?.name ?? '—'}
                            {account && account.shareLevel !== 'private' ? (
                              <>
                                {' '}
                                <Badge tone="neutral">compartilhada</Badge>
                              </>
                            ) : null}
                          </td>
                          <td className={`num ${cents > 0n ? 'text-positive' : 'text-negative'}`}>
                            <strong>
                              <Money value={cents} signed />
                            </strong>
                            {status === 'pending' ? (
                              <small className="stat-hint" style={{ display: 'block' }}>
                                vence {formatDay(due)}
                              </small>
                            ) : null}
                          </td>
                          <td className="num">
                            {status === 'pending' ? (
                              <>
                                <button
                                  aria-label={`Liquidar ${transaction.description}`}
                                  className="icon-button"
                                  onClick={async () => {
                                    const failure = await settleTransaction(transaction.id);
                                    if (failure) return;
                                  }}
                                  title="Liquidar (marca como pago e move o saldo)"
                                  type="button"
                                >
                                  ✓
                                </button>
                                <button
                                  aria-label={`Cancelar ${transaction.description}`}
                                  className="icon-button"
                                  onClick={async () => {
                                    const confirmed = await dialog.confirm({
                                      title: `Cancelar “${transaction.description}”?`,
                                      description:
                                        'O lançamento fica marcado como cancelado e some dos totais, mas continua no histórico.',
                                      confirmLabel: 'Cancelar lançamento',
                                    });
                                    if (!confirmed) return;
                                    void cancelTransaction(transaction.id);
                                  }}
                                  title="Cancelar pendente sem mexer no saldo"
                                  type="button"
                                >
                                  ⊘
                                </button>
                              </>
                            ) : null}
                            <button
                              aria-label={`Excluir ${transaction.description}`}
                              className="icon-button"
                              onClick={async () => {
                                const confirmed = await dialog.confirm({
                                  title: `Excluir “${transaction.description}”?`,
                                  description:
                                    status === 'paid'
                                      ? 'O valor volta para o saldo da conta e deixa de contar nos totais do mês.'
                                      : 'O pendente é apagado sem mexer no saldo, porque ainda não era caixa.',
                                  confirmLabel: 'Excluir lançamento',
                                });
                                if (!confirmed) return;
                                void deleteTransaction(transaction.id);
                              }}
                              type="button"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div
                className="goal-actions"
                style={{ marginTop: 16, justifyContent: 'space-between' }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Mostrando {Math.min(limit, filtered.length)} de {filtered.length} lançamentos ·{' '}
                  {formatAmount(totals.expense)} em saídas · {formatAmount(-totals.pending)} a
                  pagar/receber
                </span>
                {limit < filtered.length ? (
                  <button
                    className="button button-ghost"
                    onClick={() => setLimit((value) => value + PAGE_SIZE)}
                    type="button"
                  >
                    Carregar mais
                  </button>
                ) : null}
              </div>
            </>
          )}
        </Card>
      </div>

      <TransactionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </AppShell>
  );
}
