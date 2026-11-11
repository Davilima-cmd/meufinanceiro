'use client';

import { cornerRadius, spacing, themes } from '@meufinanceiro/design-tokens';
import { formatCents } from '@meufinanceiro/shared-types';
import {
  api,
  type ApiUser,
  type ApiAccount,
  type ApiTransaction,
  type ApiBankConnection,
} from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { CSSProperties } from 'react';
import { useState, useEffect, useCallback } from 'react';

type Screen = 'home' | 'transactions' | 'accounts' | 'profile';

function connectionLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'awaiting_authorization':
      return 'Aguardando autorização';
    case 'expired':
      return 'Expirada';
    case 'error':
      return 'Com erro';
    case 'disconnected':
      return 'Desconectada';
    default:
      return status;
  }
}

function HiddenAmount({ cents, hidden }: { cents: string; hidden: boolean }) {
  return <>{hidden ? '••••••' : formatCents(BigInt(cents))}</>;
}

function TransactionRow({ transaction, hidden }: { transaction: ApiTransaction; hidden: boolean }) {
  const isIncome = BigInt(transaction.amountCents) > 0n;

  return (
    <li className="transaction-row">
      <span className="transaction-mark" aria-hidden="true">
        {transaction.type.slice(0, 1).toUpperCase()}
      </span>
      <span className="transaction-copy">
        <span className="transaction-name">{transaction.description}</span>
        <span className="transaction-detail">
          {transaction.type} · {transaction.accountId}
        </span>
      </span>
      <time className="transaction-date">{transaction.date}</time>
      <strong className={`transaction-amount ${isIncome ? 'is-positive' : ''}`}>
        <HiddenAmount cents={transaction.amountCents} hidden={hidden} />
      </strong>
    </li>
  );
}

export function FinanceApp({ user }: { user: ApiUser }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [hidden, setHidden] = useState(false);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [connections, setConnections] = useState<ApiBankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const [disablingMfa, setDisablingMfa] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newTxDescription, setNewTxDescription] = useState('');
  const [newTxAmount, setNewTxAmount] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [accs, txs, conns] = await Promise.all([
        api.getAccounts(),
        api.getTransactions(),
        api.getConnections().catch(() => [] as ApiBankConnection[]),
      ]);
      setAccounts(accs);
      setTransactions(txs);
      setConnections(conns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  const { mfaDisable } = useAuth();

  const handleDisableMfa = useCallback(async () => {
    if (!window.confirm('Tem certeza que deseja desativar a verificação em duas etapas?')) return;
    setDisablingMfa(true);
    setError(null);
    try {
      await mfaDisable();
      setNotice('Verificação em duas etapas desativada');
      window.setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao desativar a verificação em duas etapas'
      );
    } finally {
      setDisablingMfa(false);
    }
  }, [mfaDisable]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const balanceCents = accounts.reduce((acc, a) => acc + BigInt(a.balanceCents), 0n);

  const expenseCents = transactions.reduce(
    (acc, t) => (BigInt(t.amountCents) < 0n ? acc + BigInt(t.amountCents) : acc),
    0n
  );
  const incomeCents = transactions.reduce(
    (acc, t) => (BigInt(t.amountCents) > 0n ? acc + BigInt(t.amountCents) : acc),
    0n
  );

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountName.trim()) return;
    try {
      const created = await api.createAccount({
        name: newAccountName,
        type: 'manual',
        currency: 'BRL',
      });
      setAccounts([...accounts, created]);
      setNewAccountName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta');
    }
  }

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!newTxDescription.trim() || !newTxAmount.trim() || accounts.length === 0) return;
    try {
      const created = await api.createTransaction({
        accountId: accounts[0].id,
        description: newTxDescription,
        amountCents: newTxAmount,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
      });
      setTransactions([created, ...transactions]);
      setNewTxDescription('');
      setNewTxAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar lançamento');
    }
  }

  async function handleSync() {
    setError(null);
    setSyncing(true);
    try {
      await api.triggerSync();
      await loadData();
      setNotice('Sincronização concluída');
      window.setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  const palette = themes.light;
  const appStyle: Record<string, string> = {
    '--color-canvas': palette.canvas,
    '--color-surface': palette.surface,
    '--color-text': palette.text,
    '--color-muted': palette.muted,
    '--color-border': palette.border,
    '--color-accent': palette.accent,
    '--color-accent-soft': palette.accentSoft,
    '--color-positive': palette.positive,
    '--color-positive-soft': palette.positiveSoft,
    '--color-negative': palette.negative,
    '--radius-card': `${cornerRadius.large}px`,
    '--space-unit': `${spacing.md}px`,
  };

  if (loading) {
    return (
      <div className="finance-app" style={appStyle}>
        <div className="loading">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="finance-app" style={appStyle}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-lockup">
            <span aria-hidden="true" className="brand-mark">
              mf
            </span>
            <span>meu financeiro</span>
          </div>
          <nav aria-label="Navegação principal" className="sidebar-nav">
            <button
              key="home"
              className={`nav-item ${screen === 'home' ? 'is-active' : ''}`}
              onClick={() => setScreen('home')}
            >
              Visão geral
            </button>
            <button
              key="transactions"
              className={`nav-item ${screen === 'transactions' ? 'is-active' : ''}`}
              onClick={() => setScreen('transactions')}
            >
              Movimentações
            </button>
            <button
              key="accounts"
              className={`nav-item ${screen === 'accounts' ? 'is-active' : ''}`}
              onClick={() => setScreen('accounts')}
            >
              Contas
            </button>
            <button
              key="profile"
              className={`nav-item ${screen === 'profile' ? 'is-active' : ''}`}
              onClick={() => setScreen('profile')}
            >
              Perfil
            </button>
          </nav>
          <div className="user-info">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </aside>

        <div className="main-area">
          <header className="topbar">
            <span className="topbar-title">
              {screen === 'home' ? 'Visão geral' : screen.charAt(0).toUpperCase() + screen.slice(1)}
            </span>
            <div className="topbar-actions">
              <span className="demo-indicator">
                <span />
                Conectado à API
              </span>
              <button
                aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                className="icon-button"
                onClick={() => setHidden(!hidden)}
              >
                {hidden ? 'Mostrar' : 'Ocultar'}
              </button>
            </div>
          </header>
          <main className="page-content">
            {error && <p className="error-msg">{error}</p>}

            {screen === 'home' && (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">Sua vida financeira</p>
                    <h1>Visão geral</h1>
                    <p className="page-description">Dados sincronizados com a API.</p>
                  </div>
                  <button
                    className="button button-primary"
                    disabled={syncing}
                    onClick={handleSync}
                    type="button"
                  >
                    {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
                  </button>
                </div>
                <section className="summary-layout">
                  <article className="balance-panel">
                    <div className="balance-topline">
                      <span>Saldo consolidado</span>
                    </div>
                    <div className="balance-value">
                      <HiddenAmount cents={balanceCents.toString()} hidden={hidden} />
                    </div>
                    <p className="balance-caption">Suas contas cadastradas</p>
                  </article>
                  <div className="metric-stack">
                    <article className="metric-card">
                      <span className="metric-label">Entradas</span>
                      <strong className="metric-value is-positive">
                        <HiddenAmount cents={incomeCents.toString()} hidden={hidden} />
                      </strong>
                    </article>
                    <article className="metric-card">
                      <span className="metric-label">Saídas</span>
                      <strong className="metric-value">
                        <HiddenAmount cents={expenseCents.toString()} hidden={hidden} />
                      </strong>
                    </article>
                  </div>
                </section>

                <section className="dashboard-grid">
                  <article className="panel recent-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Movimentações recentes</h2>
                        <p>Últimos lançamentos sincronizados</p>
                      </div>
                    </div>
                    <ul className="transactions-list">
                      {transactions.slice(0, 5).map((tx) => (
                        <TransactionRow hidden={hidden} key={tx.id} transaction={tx} />
                      ))}
                    </ul>
                    <button className="text-button" onClick={() => setScreen('transactions')}>
                      Ver todas
                    </button>
                  </article>

                  <article className="panel accounts-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Contas</h2>
                        <p>{accounts.length} conta(s) cadastrada(s)</p>
                      </div>
                    </div>
                    <ul className="account-list">
                      {accounts.map((acct) => (
                        <li key={acct.id} className="account-row">
                          <span className="account-mark" aria-hidden="true">
                            {acct.name.slice(0, 1)}
                          </span>
                          <span className="account-copy">
                            <span className="account-name">{acct.name}</span>
                            <span className="account-detail">
                              {acct.institution || 'Sem instituição'}
                            </span>
                          </span>
                          <strong className="account-balance">
                            <HiddenAmount cents={acct.balanceCents} hidden={hidden} />
                          </strong>
                        </li>
                      ))}
                    </ul>
                    <form onSubmit={handleCreateAccount} className="create-account-form">
                      <input
                        className="input"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="Nova conta"
                        required
                      />
                      <button type="submit" className="button button-primary">
                        Criar
                      </button>
                    </form>
                  </article>
                </section>
              </>
            )}

            {screen === 'transactions' && (
              <section className="panel list-panel">
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">Movimentações</p>
                    <h2>Movimentações</h2>
                    <p className="page-description">Lançamentos sincronizados com a API.</p>
                  </div>
                  <form onSubmit={handleCreateTransaction} className="create-tx-form">
                    <input
                      className="input"
                      value={newTxDescription}
                      onChange={(e) => setNewTxDescription(e.target.value)}
                      placeholder="Descrição"
                      required
                    />
                    <input
                      className="input"
                      value={newTxAmount}
                      onChange={(e) => setNewTxAmount(e.target.value)}
                      placeholder="Valor (ex: -150,00)"
                      required
                    />
                    <button type="submit" className="button button-primary">
                      Adicionar
                    </button>
                  </form>
                </div>
                <ul className="transactions-list">
                  {transactions.map((tx) => (
                    <TransactionRow hidden={hidden} key={tx.id} transaction={tx} />
                  ))}
                </ul>
              </section>
            )}

            {screen === 'accounts' && (
              <section className="account-list-panel">
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">Contas e carteiras</p>
                    <h2>Contas</h2>
                  </div>
                  <button
                    className="button button-primary"
                    disabled={syncing}
                    onClick={handleSync}
                    type="button"
                  >
                    {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
                  </button>
                </div>
                <ul className="account-list">
                  {accounts.map((acct) => {
                    const connection = connections.find((c) => c.account.id === acct.id);
                    return (
                      <li key={acct.id} className="account-card" style={{ gap: 12 }}>
                        <span className="account-mark" aria-hidden="true">
                          {acct.name.slice(0, 1)}
                        </span>
                        <div className="account-main">
                          <span className="account-name">{acct.name}</span>
                          <span className="account-detail">
                            {acct.institution || 'Sem instituição'} · {acct.type}
                          </span>
                          {connection && (
                            <span className="account-detail">
                              {connectionLabel(connection.status)} · última sincronização:{' '}
                              {new Date(connection.updatedAt).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                        <strong className="account-balance">
                          <HiddenAmount cents={acct.balanceCents} hidden={hidden} />
                        </strong>
                      </li>
                    );
                  })}
                </ul>
                <form onSubmit={handleCreateAccount} className="create-account-form">
                  <input
                    className="input"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="Nova conta"
                    required
                  />
                  <button type="submit" className="button button-primary">
                    Criar conta
                  </button>
                </form>
              </section>
            )}

            {screen === 'profile' && (
              <section className="profile-panel">
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">Perfil</p>
                    <h2>Perfil</h2>
                    <p className="page-description">Dados da sua conta de usuário.</p>
                  </div>
                </div>
                <ul className="profile-list">
                  <li className="profile-row">
                    <span>Nome</span>
                    <span>{user.name}</span>
                  </li>
                  <li className="profile-row">
                    <span>E-mail</span>
                    <span>{user.email}</span>
                  </li>
                  <li className="profile-row">
                    <span>ID</span>
                    <span>{user.id}</span>
                  </li>
                  <li className="profile-row">
                    <span>Verificação em duas etapas</span>
                    <span>{user.mfaEnabled ? 'Ativado' : 'Desativado'}</span>
                  </li>
                </ul>
                <div className="profile-actions">
                  {user.mfaEnabled ? (
                    <button
                      onClick={handleDisableMfa}
                      className="button button-primary"
                      disabled={disablingMfa}
                      type="button"
                    >
                      {disablingMfa ? 'Desativando…' : 'Desativar verificação em duas etapas'}
                    </button>
                  ) : (
                    <a href="/auth/mfa-enable" className="button button-primary">
                      Ativar verificação em duas etapas
                    </a>
                  )}
                </div>
              </section>
            )}

            {notice ? (
              <div className="toast" role="status">
                {notice}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
