'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Select, useDialog } from '@/components/dialog';
import { Badge, Card, EmptyState, Money, PageHeader, ProgressBar } from '@/components/ui';
import { spentByCategory } from '@/lib/analytics';
import {
  centsFromInput,
  currentMonthKey,
  formatBRL,
  formatMonth,
  shiftMonth,
  toCents,
} from '@/lib/format';
import { useFinance } from '@/lib/store';

export default function BudgetsPage() {
  const { snapshot, session, setBudget, deleteBudget } = useFinance();
  const dialog = useDialog();
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const ownerId = session?.user.id ?? '';
  const spent = useMemo(
    () => spentByCategory(snapshot, monthKey, ownerId),
    [snapshot, monthKey, ownerId]
  );

  const budgets = useMemo(
    () =>
      snapshot.budgets
        .filter((budget) => budget.periodStart.slice(0, 7) === monthKey)
        .map((budget) => {
          const category = snapshot.categories.find((item) => item.id === budget.categoryId);
          const limit = toCents(budget.amountCents);
          const used = spent.get(budget.categoryId) ?? 0n;
          const percent = limit > 0n ? Math.round((Number(used) / Number(limit)) * 100) : 0;
          return {
            ...budget,
            name: category?.name ?? 'Categoria',
            color: category?.color ?? '#8b97a3',
            used,
            limit,
            percent,
            remaining: limit - used,
          };
        })
        .sort((left, right) => right.percent - left.percent),
    [snapshot.budgets, snapshot.categories, monthKey, spent]
  );

  const budgetByCategory = useMemo(
    () => new Map(budgets.map((budget) => [budget.categoryId, budget])),
    [budgets]
  );

  const amountPreview = useMemo(() => {
    const cents = centsFromInput(amount);
    return cents > 0n ? cents : 0n;
  }, [amount]);

  const totals = useMemo(() => {
    const limit = budgets.reduce((sum, budget) => sum + budget.limit, 0n);
    const used = budgets.reduce((sum, budget) => sum + budget.used, 0n);
    return { limit, used, remaining: limit - used };
  }, [budgets]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!categoryId) {
      setError('Escolha uma categoria.');
      return;
    }
    const cents = centsFromInput(amount);
    if (cents <= 0n) {
      setError('Informe um limite maior que zero.');
      return;
    }
    setBudget({ categoryId, amountCents: cents.toString(), monthKey });
    setAmount('');
    setCategoryId('');
    void dialog.notice({
      title: 'Limite salvo',
      description: `${formatBRL(cents)} por mês em ${formatMonth(monthKey)}. Acompanhe o consumo no cartão acima.`,
      tone: 'success',
      confirmLabel: 'Fechar',
    });
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Planejamento"
        title="Orçamentos"
        description="Defina limites por categoria e acompanhe o consumo em tempo real."
        actions={
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
              onClick={() => setMonthKey((value) => shiftMonth(value, 1))}
              type="button"
            >
              →
            </button>
          </div>
        }
      />

      <div className="stack">
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Limite total do mês</span>
            <strong className="stat-value">
              <Money value={totals.limit} />
            </strong>
            <span className="stat-hint">{budgets.length} orçamento(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Utilizado</span>
            <strong className="stat-value is-negative">
              <Money value={totals.used} />
            </strong>
          </div>
          <div className="stat">
            <span className="stat-label">Disponível</span>
            <strong
              className={`stat-value ${totals.remaining >= 0n ? 'is-positive' : 'is-negative'}`}
            >
              <Money value={totals.remaining} />
            </strong>
          </div>
        </div>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Limites por categoria</h2>
              <p>{formatMonth(monthKey)} · gasto calculado só com contas de histórico liberado</p>
            </div>
          </div>

          {budgets.length === 0 ? (
            <EmptyState
              description="Crie um limite por categoria para acompanhar o consumo no mês."
              title="Nenhum orçamento neste mês"
            />
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {budgets.map((budget) => (
                <div className="goal-card" key={budget.id} style={{ padding: 16 }}>
                  <div className="goal-head">
                    <span className="legend-name">
                      <i className="dot-color" style={{ background: budget.color }} />
                      <strong style={{ fontSize: 14 }}>{budget.name}</strong>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {budget.percent >= 100 ? (
                        <Badge tone="negative">estourou</Badge>
                      ) : budget.percent >= 80 ? (
                        <Badge tone="warning">atenção</Badge>
                      ) : (
                        <Badge tone="positive">no controle</Badge>
                      )}
                      <button
                        aria-label={`Excluir orçamento de ${budget.name}`}
                        className="icon-button"
                        onClick={async () => {
                          const confirmed = await dialog.confirm({
                            title: `Excluir o limite de “${budget.name}”?`,
                            description: `O orçamento de ${formatMonth(monthKey)} deixa de ser acompanhado. Os lançamentos continuam intactos.`,
                            confirmLabel: 'Excluir limite',
                          });
                          if (confirmed) deleteBudget(budget.id);
                        }}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <ProgressBar
                    percent={budget.percent}
                    tone={
                      budget.percent >= 100
                        ? 'negative'
                        : budget.percent >= 80
                          ? undefined
                          : 'positive'
                    }
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span className="text-muted">
                      <Money value={budget.used} /> de <Money value={budget.limit} />
                    </span>
                    <strong className={budget.remaining < 0n ? 'text-negative' : 'text-positive'}>
                      {budget.remaining < 0n ? 'Faltando ' : 'Sobram '}
                      {formatBRL(budget.remaining < 0n ? -budget.remaining : budget.remaining)}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Definir limite</h2>
              <p>Se a categoria já possui limite neste mês, o valor é atualizado</p>
            </div>
          </div>
          <form className="form-row" onSubmit={handleSubmit}>
            <div className="field">
              <span>Categoria</span>
              <Select
                label="Categoria do orçamento"
                onChange={setCategoryId}
                options={[
                  { value: '', label: 'Escolha uma categoria…' },
                  ...snapshot.categories
                    .filter((category) => category.kind !== 'income')
                    .map((category) => ({
                      value: category.id,
                      label: category.name,
                      color: category.color,
                      hint: budgetByCategory.has(category.id) ? 'já tem limite' : undefined,
                    })),
                ]}
                value={categoryId}
              />
            </div>
            <label className="field">
              <span>Limite mensal</span>
              <input
                aria-label="Limite mensal"
                className="input"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="600,00"
                value={amount}
              />
              <span className="field-hint">
                {amountPreview === 0n ? 'Digite o valor do limite' : formatBRL(amountPreview)}
              </span>
            </label>
            <button className="button button-primary" type="submit">
              Salvar limite
            </button>
          </form>
          {error ? (
            <p className="form-error" style={{ marginTop: 12 }}>
              {error}
            </p>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
