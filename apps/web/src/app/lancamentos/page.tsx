'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
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
} from '@/lib/format';
import { useFinance } from '@/lib/store';
import type { TransactionType } from '@/lib/types';

type Filter = 'all' | TransactionType;

const PAGE_SIZE = 20;

export default function TransactionsPage() {
  const { snapshot, session, deleteTransaction } = useFinance();
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [filter, setFilter] = useState<Filter>('all');
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
  }, [visible, monthKey, filter, accountFilter, search, categoryById]);

  const totals = useMemo(() => {
    const income = sumCents(
      filtered
        .filter((transaction) => toCents(transaction.amountCents) > 0n)
        .map((t) => t.amountCents)
    );
    const expense = -sumCents(
      filtered
        .filter((transaction) => toCents(transaction.amountCents) < 0n)
        .map((t) => t.amountCents)
    );
    return { income, expense, net: income - expense };
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
            <select
              aria-label="Filtrar por conta"
              className="input"
              onChange={(event) => {
                setAccountFilter(event.target.value);
                setLimit(PAGE_SIZE);
              }}
              value={accountFilter}
            >
              <option value="all">Todas as contas</option>
              {snapshot.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
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
                          </td>
                          <td className="num">
                            <button
                              aria-label={`Excluir ${transaction.description}`}
                              className="icon-button"
                              onClick={() => {
                                if (window.confirm(`Excluir “${transaction.description}”?`)) {
                                  deleteTransaction(transaction.id);
                                }
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
                  {formatAmount(totals.expense)} em saídas
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
