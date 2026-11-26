'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, EmptyState, Money, PageHeader } from '@/components/ui';
import { visibleAccounts } from '@/lib/analytics';
import {
  billingItems,
  billingSummary,
  REMINDER_WINDOW_DAYS,
  type BillingBucket,
  type BillingItem,
} from '@/lib/billing';
import { formatDay, todayISO } from '@/lib/format';
import { isReadOnlyAccount } from '@/lib/account-access';
import { useFinance } from '@/lib/store';

/**
 * Contas a pagar e a receber.
 *
 * A pergunta que esta tela responde é "o que eu preciso pagar e quando". Por
 * isso a ordem é por urgência (atrasado → hoje → próximos → futuro), não por
 * data de lançamento, e o que já foi liquidado não aparece.
 */
const BUCKET_LABEL: Record<BillingBucket, string> = {
  overdue: 'Atrasado',
  'due-today': 'Vence hoje',
  soon: 'Próximos dias',
  upcoming: 'A vencer',
};

const BUCKET_TONE: Record<BillingBucket, 'negative' | 'warning' | 'accent' | 'neutral'> = {
  overdue: 'negative',
  'due-today': 'warning',
  soon: 'accent',
  upcoming: 'neutral',
};

type Filter = 'urgent' | 'all' | 'expense' | 'income';

export default function VencimentosPage() {
  const { snapshot, session, settleTransaction } = useFinance();
  const [filter, setFilter] = useState<Filter>('urgent');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id ?? '';
  const accounts = useMemo(() => visibleAccounts(snapshot, userId), [snapshot, userId]);
  const accountById = useMemo(
    () => new Map(snapshot.accounts.map((account) => [account.id, account])),
    [snapshot.accounts]
  );
  const categoryById = useMemo(
    () => new Map(snapshot.categories.map((category) => [category.id, category])),
    [snapshot.categories]
  );
  const visibleAccountIds = useMemo(
    () => new Set(accounts.map((account) => account.id)),
    [accounts]
  );

  const items = useMemo(
    () => billingItems(snapshot.transactions.filter((t) => visibleAccountIds.has(t.accountId))),
    [snapshot.transactions, visibleAccountIds]
  );
  const summary = useMemo(() => billingSummary(items), [items]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'urgent') return items.filter((item) => item.days <= REMINDER_WINDOW_DAYS);
    if (filter === 'expense') return items.filter((item) => !item.isIncome);
    return items.filter((item) => item.isIncome);
  }, [items, filter]);

  async function handleSettle(item: BillingItem) {
    const account = accountById.get(item.transaction.accountId);
    if (account && isReadOnlyAccount(account, userId)) {
      setError('Conta compartilhada é somente leitura: só o dono liquida lançamentos nela.');
      return;
    }
    setError(null);
    setBusyId(item.transaction.id);
    const message = await settleTransaction(item.transaction.id, todayISO());
    setBusyId(null);
    if (message) setError(message);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Contas a pagar e receber"
        title="Vencimentos"
        description="O que ainda não passou pelo caixa, ordenado por urgência."
      />

      <div className="stack">
        {summary.overdueCount > 0 || summary.dueTodayCount > 0 ? (
          <Card className="notice notice-warning">
            <strong>
              {summary.overdueCount + summary.dueTodayCount} conta(s) precisando de atenção agora —{' '}
              <Money value={summary.urgentCents} />
            </strong>
            <p>
              {summary.overdueCount > 0 ? `${summary.overdueCount} atrasada(s). ` : ''}
              {summary.dueTodayCount > 0 ? `${summary.dueTodayCount} vencendo hoje.` : ''}
            </p>
          </Card>
        ) : null}

        {error ? (
          <Card className="notice notice-error">
            <strong>{error}</strong>
          </Card>
        ) : null}

        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Atrasado</span>
            <strong className="stat-value is-negative">
              <Money value={summary.overdueCents} />
            </strong>
            <span className="stat-hint">{summary.overdueCount} lançamento(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Vence hoje</span>
            <strong className="stat-value">
              <Money value={summary.dueTodayCents} />
            </strong>
            <span className="stat-hint">{summary.dueTodayCount} lançamento(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Próximos {REMINDER_WINDOW_DAYS} dias</span>
            <strong className="stat-value">
              <Money value={summary.soonCents} />
            </strong>
            <span className="stat-hint">{summary.soonCount} lançamento(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total pendente</span>
            <strong className="stat-value">
              <Money value={summary.pendingCents} />
            </strong>
            <span className="stat-hint">não afeta o saldo até liquidar</span>
          </div>
        </div>

        <Card>
          <div className="filter-bar">
            {(
              [
                ['urgent', 'Precisa de atenção'],
                ['all', 'Todos'],
                ['expense', 'A pagar'],
                ['income', 'A receber'],
              ] as Array<[Filter, string]>
            ).map(([value, label]) => (
              <button
                className={`chip ${filter === value ? 'is-selected' : ''}`}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="Nada pendente por aqui"
              description={
                filter === 'urgent'
                  ? 'Nenhuma conta atrasada ou vencendo nos próximos dias. Bom sinal.'
                  : 'Nenhum lançamento pendente nesse filtro.'
              }
            />
          ) : (
            <ul className="list">
              {filtered.map((item) => {
                const account = accountById.get(item.transaction.accountId);
                const category = item.transaction.categoryId
                  ? categoryById.get(item.transaction.categoryId)
                  : null;
                const readOnly = account ? isReadOnlyAccount(account, userId) : false;
                return (
                  <li className="list-row" key={item.transaction.id}>
                    <span className="row-mark" aria-hidden="true">
                      {item.isIncome ? '↓' : '↑'}
                    </span>
                    <div className="row-copy">
                      <strong>{item.transaction.description}</strong>
                      <small>
                        vence {formatDay(item.dueDate)} · {account?.name ?? 'Conta removida'}
                        {category ? ` · ${category.name}` : ''}
                      </small>
                    </div>
                    <div className="row-end">
                      <span
                        className={`row-amount ${item.isIncome ? 'is-positive' : 'is-negative'}`}
                      >
                        <Money value={item.transaction.amountCents} signed />
                      </span>
                      <Badge tone={BUCKET_TONE[item.bucket]}>{BUCKET_LABEL[item.bucket]}</Badge>
                    </div>
                    <div className="row-actions">
                      <button
                        className="button button-ghost"
                        disabled={busyId === item.transaction.id || readOnly}
                        onClick={() => void handleSettle(item)}
                        title={readOnly ? 'Conta compartilhada: só o dono liquida' : undefined}
                        type="button"
                      >
                        {busyId === item.transaction.id
                          ? 'Liquidando…'
                          : item.isIncome
                            ? 'Recebi'
                            : 'Paguei'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
