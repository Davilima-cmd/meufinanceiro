'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Select, useDialog } from '@/components/dialog';
import { Badge, Card, EmptyState, Money, PageHeader } from '@/components/ui';
import { monthKeyOf, currentMonthKey, sumCents, toCents } from '@/lib/format';
import { useFinance } from '@/lib/store';
import type { AccountType } from '@/lib/types';

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'checking', label: 'Conta corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'credit', label: 'Cartão de crédito' },
  { value: 'investment', label: 'Investimento' },
  { value: 'cash', label: 'Dinheiro / carteira' },
  { value: 'manual', label: 'Controle manual' },
];

export default function AccountsPage() {
  const { snapshot, session, addAccount, deleteAccount } = useFinance();
  const dialog = useDialog();
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [error, setError] = useState('');

  const ownerId = session?.user.id ?? '';
  const monthKey = currentMonthKey();

  const totals = useMemo(() => {
    const assets = snapshot.accounts
      .filter((account) => toCents(account.balanceCents) >= 0n)
      .reduce((sum, account) => sum + toCents(account.balanceCents), 0n);
    const debts = snapshot.accounts
      .filter((account) => toCents(account.balanceCents) < 0n)
      .reduce((sum, account) => sum + -toCents(account.balanceCents), 0n);
    return { assets, debts, net: assets - debts };
  }, [snapshot.accounts]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Dê um nome à conta.');
      return;
    }
    addAccount({ name, institution, type, shareLevel: 'private' });
    setName('');
    setInstitution('');
    setType('checking');
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Patrimônio"
        title="Contas e carteiras"
        description="Cada conta nasce privada. Compartilhe com seu parceiro na tela Casal, escolhendo o nível de acesso."
      />

      <div className="stack">
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">Saldo consolidado</span>
            <strong className={`stat-value ${totals.net >= 0n ? 'is-positive' : 'is-negative'}`}>
              <Money value={totals.net} />
            </strong>
            <span className="stat-hint">{snapshot.accounts.length} conta(s)</span>
          </div>
          <div className="stat">
            <span className="stat-label">Disponível</span>
            <strong className="stat-value is-positive">
              <Money value={totals.assets} />
            </strong>
          </div>
          <div className="stat">
            <span className="stat-label">Cartões e dívidas</span>
            <strong className="stat-value is-negative">
              <Money value={-totals.debts} />
            </strong>
          </div>
        </div>

        {snapshot.accounts.length === 0 ? (
          <EmptyState
            description="Cadastre sua primeira conta para começar a registrar movimentações."
            title="Nenhuma conta cadastrada"
          />
        ) : (
          <div className="account-grid">
            {snapshot.accounts.map((account) => {
              const monthTotal = sumCents(
                snapshot.transactions
                  .filter(
                    (transaction) =>
                      transaction.accountId === account.id &&
                      monthKeyOf(transaction.date) === monthKey
                  )
                  .map((transaction) => transaction.amountCents)
              );
              const own = account.ownerId === ownerId;
              const typeLabel =
                ACCOUNT_TYPES.find((option) => option.value === account.type)?.label ??
                account.type;
              return (
                <article className="account-card" key={account.id}>
                  <div className="account-top">
                    <span
                      aria-hidden="true"
                      className="account-badge"
                      style={{ background: `${account.color}22`, color: account.color }}
                    >
                      {account.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <div className="account-name">{account.name}</div>
                      <div className="account-sub">
                        {account.institution ?? typeLabel}
                        {account.institution ? ` · ${typeLabel}` : ''}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      {account.shareLevel === 'private' ? (
                        <Badge tone="neutral">privada</Badge>
                      ) : account.shareLevel === 'FULL' ? (
                        <Badge tone="accent">histórico</Badge>
                      ) : (
                        <Badge tone="accent">só saldo</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="account-balance">
                      <Money value={account.balanceCents} />
                    </div>
                    <div className="account-sub">
                      {own ? 'Sua conta' : `De ${account.ownerName}`} · movimento do mês{' '}
                      <Money value={monthTotal} signed />
                    </div>
                  </div>
                  <div className="account-foot">
                    <span className="account-sub">
                      {account.type === 'credit' ? 'Fatura em aberto' : 'Saldo atual'}
                    </span>
                    {own ? (
                      <button
                        className="link-button"
                        onClick={async () => {
                          const count = snapshot.transactions.filter(
                            (item) => item.accountId === account.id
                          ).length;
                          const confirmed = await dialog.confirm({
                            title: `Excluir “${account.name}”?`,
                            description:
                              count > 0
                                ? `A conta e ${count} lançamento(s) dela serão removidos. Não dá para desfazer.`
                                : 'A conta será removida. Não dá para desfazer.',
                            confirmLabel: 'Excluir conta',
                          });
                          if (confirmed) deleteAccount(account.id);
                        }}
                        type="button"
                      >
                        Excluir
                      </button>
                    ) : (
                      <span className="account-sub">gerenciada por {account.ownerName}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <Card>
          <div className="card-heading">
            <div>
              <h2>Nova conta</h2>
              <p>A conta começa privada e com saldo zero</p>
            </div>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-row">
              <label className="field">
                <span>Nome</span>
                <input
                  className="input"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Conta corrente"
                  value={name}
                />
              </label>
              <label className="field">
                <span>Instituição (opcional)</span>
                <input
                  className="input"
                  onChange={(event) => setInstitution(event.target.value)}
                  placeholder="Nubank, Bradesco…"
                  value={institution}
                />
              </label>
              <div className="field">
                <span>Tipo</span>
                <Select
                  label="Tipo da conta"
                  onChange={(next) => setType(next as AccountType)}
                  options={ACCOUNT_TYPES.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  value={type}
                />
              </div>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="page-actions">
              <button className="button button-primary" type="submit">
                Criar conta
              </button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
