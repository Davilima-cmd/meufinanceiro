'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Select, useDialog } from '@/components/dialog';
import { Badge, Card, EmptyState, Money, PageHeader, ProgressBar } from '@/components/ui';
import { visibleAccounts } from '@/lib/analytics';
import { centsFromInput, formatBRL, toCents } from '@/lib/format';
import { debtRatio, summarizeNetWorth } from '@/lib/net-worth';
import { useFinance } from '@/lib/store';
import type { NetWorthItemKind } from '@/lib/types';

/**
 * Patrimônio: o que você tem (contas + bens) menos o que deve (dívidas).
 *
 * A tela existe porque só o saldo das contas não responde "qual é o meu
 * patrimônio": carro, imóvel, financiamento e empréstimo não são conta
 * corrente. E o passivo tem o mesmo peso visual do ativo — dívida escondida
 * não é patrimônio.
 */
export default function PatrimonioPage() {
  const { snapshot, session, addNetWorthItem, updateNetWorthItemValue, deleteNetWorthItem } =
    useFinance();
  const dialog = useDialog();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<NetWorthItemKind>('asset');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = session?.user.id ?? '';
  const accounts = useMemo(() => visibleAccounts(snapshot, userId), [snapshot, userId]);
  const items = useMemo(() => snapshot.netWorthItems ?? [], [snapshot.netWorthItems]);
  const summary = useMemo(() => summarizeNetWorth(accounts, items), [accounts, items]);
  const ratio = debtRatio(summary);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Dê um nome ao item.');
      return;
    }
    const cents = centsFromInput(value);
    if (cents <= 0n) {
      setError('Informe um valor maior que zero.');
      return;
    }
    setBusy(true);
    const failure = await addNetWorthItem({
      name,
      kind,
      valueCents: cents.toString(),
    });
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setName('');
    setValue('');
  }

  async function handleValueChange(itemId: string, currentValue: string) {
    const input = window.prompt('Novo valor (R$)', formatBRL(toCents(currentValue)));
    if (input === null) return;
    const cents = centsFromInput(input);
    if (cents <= 0n) {
      setError('Informe um valor maior que zero.');
      return;
    }
    const failure = await updateNetWorthItemValue(itemId, cents.toString());
    if (failure) setError(failure);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Bens e dívidas"
        title="Patrimônio"
        description="O saldo das contas, mais o que você possui e menos o que deve."
      />

      <div className="stack">
        {error ? (
          <Card className="notice notice-error">
            <strong>{error}</strong>
          </Card>
        ) : null}

        <section className="hero">
          <div className="hero-balance">
            <span className="label">Patrimônio líquido</span>
            <span className={`value ${summary.netCents < 0n ? 'is-negative' : ''}`}>
              <Money value={summary.netCents} signed />
            </span>
            <div className="meta">
              <span>
                Contas{' '}
                <strong>
                  <Money value={summary.accountsTotalCents} />
                </strong>
              </span>
              <span>
                Bens{' '}
                <strong>
                  <Money value={summary.assetsCents} />
                </strong>
              </span>
              <span>
                Dívidas{' '}
                <strong className={summary.liabilitiesCents > 0n ? 'is-negative' : undefined}>
                  <Money value={summary.liabilitiesCents} />
                </strong>
              </span>
            </div>
          </div>
          <div className="hero-side">
            <div className="mini-stat">
              <span>Endividamento</span>
              <strong className={ratio >= 50 ? 'text-negative' : 'text-positive'}>{ratio}%</strong>
              <ProgressBar percent={ratio} tone={ratio >= 50 ? 'negative' : 'positive'} />
              <small className="text-muted">
                {ratio === 0
                  ? 'Nenhuma dívida declarada'
                  : ratio >= 100
                    ? 'A dívida consome todo o patrimônio'
                    : 'daquilo que você tem está comprometido'}
              </small>
            </div>
          </div>
        </section>

        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Contas</span>
            <strong className="stat-value">
              <Money value={summary.accountsTotalCents} />
            </strong>
            <span className="stat-hint">{accounts.length} conta(s) ativa(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Bens</span>
            <strong className="stat-value is-positive">
              <Money value={summary.assetsCents} />
            </strong>
            <span className="stat-hint">
              {items.filter((item) => item.kind === 'asset').length} item(ns)
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Dívidas</span>
            <strong className="stat-value is-negative">
              <Money value={summary.liabilitiesCents} />
            </strong>
            <span className="stat-hint">
              {items.filter((item) => item.kind === 'liability').length} item(ns)
            </span>
          </div>
        </div>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Bens e dívidas declarados</h2>
              <p>O que não é conta corrente: carro, imóvel, financiamento, empréstimo.</p>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="Nada declarado ainda"
              description="Cadastre um bem ou uma dívida para o patrimônio refletir a realidade."
            />
          ) : (
            <ul className="list">
              {items.map((item) => (
                <li className="list-row" key={item.id}>
                  <span className="row-mark" aria-hidden="true">
                    {item.kind === 'asset' ? '◆' : '▼'}
                  </span>
                  <div className="row-copy">
                    <strong>{item.name}</strong>
                    <small>{item.note ?? (item.kind === 'asset' ? 'Bem' : 'Dívida')}</small>
                  </div>
                  <div className="row-end">
                    <span
                      className={`row-amount ${item.kind === 'asset' ? 'is-positive' : 'is-negative'}`}
                    >
                      {item.kind === 'liability' ? '−' : ''}
                      <Money value={item.valueCents} />
                    </span>
                    <Badge tone={item.kind === 'asset' ? 'positive' : 'negative'}>
                      {item.kind === 'asset' ? 'bem' : 'dívida'}
                    </Badge>
                  </div>
                  <div className="row-actions">
                    <button
                      aria-label={`Alterar valor de ${item.name}`}
                      className="icon-button"
                      onClick={() => void handleValueChange(item.id, item.valueCents)}
                      type="button"
                    >
                      ✎
                    </button>
                    <button
                      aria-label={`Excluir ${item.name}`}
                      className="icon-button"
                      onClick={async () => {
                        const confirmed = await dialog.confirm({
                          title: `Excluir “${item.name}”?`,
                          description:
                            item.kind === 'liability'
                              ? 'A dívida sai do patrimônio — o valor deixa de ser subtraído.'
                              : 'O bem sai do patrimônio declarado.',
                          confirmLabel: 'Excluir',
                        });
                        if (!confirmed) return;
                        const failure = await deleteNetWorthItem(item.id);
                        if (failure) setError(failure);
                      }}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Novo item</h2>
              <p>Valor sempre positivo: o tipo define se soma ou subtrai.</p>
            </div>
          </div>
          <form className="form-row" onSubmit={handleSubmit}>
            <label className="field">
              <span>Nome</span>
              <input
                className="input"
                onChange={(event) => setName(event.target.value)}
                placeholder="Carro, apartamento, financiamento…"
                value={name}
              />
            </label>
            <div className="field">
              <span>Tipo</span>
              <Select
                label="Tipo do item"
                onChange={(next) => setKind(next as NetWorthItemKind)}
                options={[
                  { value: 'asset', label: 'Bem (soma)' },
                  { value: 'liability', label: 'Dívida (subtrai)' },
                ]}
                value={kind}
              />
            </div>
            <label className="field">
              <span>Valor</span>
              <input
                className="input"
                inputMode="decimal"
                onChange={(event) => setValue(event.target.value)}
                placeholder="50.000,00"
                value={value}
              />
            </label>
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Salvando…' : 'Adicionar'}
            </button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
