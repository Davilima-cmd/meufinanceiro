'use client';

import { cornerRadius, spacing, themes } from '@meufinanceiro/design-tokens';
import { formatCents } from '@meufinanceiro/shared-types';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import {
  demoAccounts,
  demoCategories,
  demoMonthly,
  demoTransactions,
  demoTrend,
} from '../lib/demo-data';

type Screen = 'home' | 'transactions' | 'accounts' | 'analysis' | 'profile';
type TransactionFilter = 'all' | 'income' | 'expense';
type ThemeName = 'light' | 'dark';

const navigation: Array<{ id: Screen; label: string; shortLabel: string }> = [
  { id: 'home', label: 'Visão geral', shortLabel: 'Início' },
  { id: 'transactions', label: 'Movimentações', shortLabel: 'Movimentos' },
  { id: 'accounts', label: 'Contas', shortLabel: 'Contas' },
  { id: 'analysis', label: 'Análises', shortLabel: 'Análises' },
  { id: 'profile', label: 'Perfil e ajustes', shortLabel: 'Perfil' },
];

const screenTitles: Record<Screen, string> = {
  home: 'Visão geral',
  transactions: 'Movimentações',
  accounts: 'Contas',
  analysis: 'Análises',
  profile: 'Perfil e ajustes',
};

function HiddenAmount({ cents, hidden }: { cents: bigint; hidden: boolean }) {
  return <>{hidden ? '••••••' : formatCents(cents)}</>;
}

function TransactionRow({
  transaction,
  hidden,
}: {
  transaction: (typeof demoTransactions)[number];
  hidden: boolean;
}) {
  const isIncome = transaction.amountCents > 0n;

  return (
    <li className="transaction-row">
      <span className="transaction-mark" aria-hidden="true">
        {transaction.category.slice(0, 1)}
      </span>
      <span className="transaction-copy">
        <span className="transaction-name">{transaction.description}</span>
        <span className="transaction-detail">
          {transaction.category} · {transaction.account}
        </span>
      </span>
      <time className="transaction-date">{transaction.date}</time>
      <strong className={`transaction-amount ${isIncome ? 'is-positive' : ''}`}>
        <HiddenAmount cents={transaction.amountCents} hidden={hidden} />
      </strong>
    </li>
  );
}

function CategoryBars({ hidden }: { hidden: boolean }) {
  return (
    <ul className="category-list">
      {demoCategories.map((category) => (
        <li className="category-item" key={category.name}>
          <div className="category-heading">
            <span>{category.name}</span>
            <strong>
              <HiddenAmount cents={category.amountCents} hidden={hidden} />
            </strong>
          </div>
          <div
            className="category-track"
            role="img"
            aria-label={`${category.percent}% do total em ${category.name}`}
          >
            <span style={{ width: `${category.percent}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Dashboard({
  hidden,
  joint,
  onSetJoint,
  onOpenScreen,
  onNewTransaction,
}: {
  hidden: boolean;
  joint: boolean;
  onSetJoint: (value: boolean) => void;
  onOpenScreen: (screen: Screen) => void;
  onNewTransaction: () => void;
}) {
  const balance = joint ? demoMonthly.jointBalanceCents : demoMonthly.personalBalanceCents;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dados demonstrativos</p>
          <h1>Visão geral</h1>
          <p className="page-description">Um resumo das contas e movimentações de novembro.</p>
        </div>
        <button className="button button-primary" onClick={onNewTransaction} type="button">
          Novo lançamento
        </button>
      </div>

      <section aria-label="Resumo financeiro" className="summary-layout">
        <article className="balance-panel">
          <div className="balance-topline">
            <span>Saldo consolidado</span>
            <span className="demo-tag">Exemplo fictício</span>
          </div>
          <div className="balance-value">
            <HiddenAmount cents={balance} hidden={hidden} />
          </div>
          <p className="balance-caption">
            {joint
              ? 'Visão conjunta · inclui apenas contas compartilhadas'
              : 'Minhas contas · valores de exemplo'}
          </p>
          <div aria-label="Escolher visão" className="segmented-control">
            <button
              aria-pressed={!joint}
              className={!joint ? 'is-selected' : ''}
              onClick={() => onSetJoint(false)}
              type="button"
            >
              Minhas contas
            </button>
            <button
              aria-pressed={joint}
              className={joint ? 'is-selected' : ''}
              onClick={() => onSetJoint(true)}
              type="button"
            >
              Visão conjunta
            </button>
          </div>
        </article>

        <div className="metric-stack">
          <article className="metric-card">
            <span className="metric-label">Entradas em novembro</span>
            <strong className="metric-value is-positive">
              <HiddenAmount cents={demoMonthly.incomeCents} hidden={hidden} />
            </strong>
            <span className="metric-footnote">Dados fictícios</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Saídas em novembro</span>
            <strong className="metric-value">
              <HiddenAmount cents={demoMonthly.expensesCents} hidden={hidden} />
            </strong>
            <span className="metric-footnote">Dados fictícios</span>
          </article>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <h2>Saldo ao longo do tempo</h2>
              <p>Valores ilustrativos · últimos seis meses</p>
            </div>
            <button className="text-button" onClick={() => onOpenScreen('analysis')} type="button">
              Ver análise
            </button>
          </div>
          <div
            aria-label="Gráfico ilustrativo de saldo de junho a novembro"
            className="trend-chart"
            role="img"
          >
            {demoTrend.map((point, index) => (
              <div className="trend-column" key={point.month}>
                <span
                  className={`trend-bar ${index === demoTrend.length - 1 ? 'is-current' : ''}`}
                  style={{ height: `${point.height}%` }}
                />
                <span className="trend-label">{point.month}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel categories-panel">
          <div className="panel-heading">
            <div>
              <h2>Despesas por categoria</h2>
              <p>Novembro · dados fictícios</p>
            </div>
          </div>
          <CategoryBars hidden={hidden} />
        </article>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h2>Movimentações recentes</h2>
            <p>Exemplos, sem conexão com banco</p>
          </div>
          <button
            className="text-button"
            onClick={() => onOpenScreen('transactions')}
            type="button"
          >
            Ver todas
          </button>
        </div>
        <ul className="transactions-list">
          {demoTransactions.slice(0, 5).map((transaction) => (
            <TransactionRow hidden={hidden} key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      </section>
    </>
  );
}

function Transactions({
  hidden,
  filter,
  onFilter,
  onNewTransaction,
}: {
  hidden: boolean;
  filter: TransactionFilter;
  onFilter: (value: TransactionFilter) => void;
  onNewTransaction: () => void;
}) {
  const filtered = useMemo(
    () =>
      demoTransactions.filter((transaction) => {
        if (filter === 'income') return transaction.amountCents > 0n;
        if (filter === 'expense') return transaction.amountCents < 0n;
        return true;
      }),
    [filter]
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dados demonstrativos</p>
          <h1>Movimentações</h1>
          <p className="page-description">Lista de exemplo. Nenhum lançamento é salvo.</p>
        </div>
        <button className="button button-primary" onClick={onNewTransaction} type="button">
          Novo lançamento
        </button>
      </div>
      <section aria-label="Lista de movimentações" className="panel list-panel">
        <div aria-label="Filtrar movimentações" className="filter-row">
          {[
            ['all', 'Todas'],
            ['expense', 'Saídas'],
            ['income', 'Entradas'],
          ].map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              className={`filter-chip ${filter === value ? 'is-selected' : ''}`}
              key={value}
              onClick={() => onFilter(value as TransactionFilter)}
              type="button"
            >
              {label}
            </button>
          ))}
          <span className="list-count">{filtered.length} itens de exemplo</span>
        </div>
        <ul className="transactions-list">
          {filtered.map((transaction) => (
            <TransactionRow hidden={hidden} key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      </section>
    </>
  );
}

function Accounts({ hidden, onConnect }: { hidden: boolean; onConnect: () => void }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dados demonstrativos</p>
          <h1>Contas e carteiras</h1>
          <p className="page-description">A privacidade começa com cada conta privada.</p>
        </div>
        <button className="button button-primary" onClick={onConnect} type="button">
          Conectar uma conta
        </button>
      </div>
      <section aria-label="Contas de exemplo" className="account-list">
        {demoAccounts.map((account) => (
          <article className="panel account-card" key={account.id}>
            <div className="account-symbol" aria-hidden="true">
              {account.name.slice(0, 1)}
            </div>
            <div className="account-main">
              <h2>{account.name}</h2>
              <p>{account.institution} · exemplo fictício</p>
              <span className="account-sharing">{account.share}</span>
              <span className="account-note">{account.detail}</span>
            </div>
            <strong className="account-balance">
              <HiddenAmount cents={account.balanceCents} hidden={hidden} />
            </strong>
          </article>
        ))}
      </section>
      <p className="inline-note">
        Nenhuma instituição foi conectada. O botão acima só informa que a integração ainda não foi
        implementada.
      </p>
    </>
  );
}

function Analysis({ hidden }: { hidden: boolean }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dados demonstrativos</p>
          <h1>Análises</h1>
          <p className="page-description">Distribuição de despesas ilustrativa para novembro.</p>
        </div>
        <span className="period-pill">Novembro · exemplo</span>
      </div>
      <section className="analysis-grid">
        <article className="panel analysis-total">
          <span className="metric-label">Total de saídas</span>
          <strong>
            <HiddenAmount cents={demoMonthly.expensesCents} hidden={hidden} />
          </strong>
          <p>Somente valores fictícios deste protótipo.</p>
        </article>
        <article className="panel categories-panel analysis-categories">
          <div className="panel-heading">
            <div>
              <h2>Por categoria</h2>
              <p>Valores e proporções demonstrativos</p>
            </div>
          </div>
          <CategoryBars hidden={hidden} />
        </article>
      </section>
      <section className="panel trend-panel analysis-trend">
        <div className="panel-heading">
          <div>
            <h2>Evolução do saldo</h2>
            <p>Valores ilustrativos · junho a novembro</p>
          </div>
        </div>
        <div
          aria-label="Gráfico ilustrativo de saldo de junho a novembro"
          className="trend-chart"
          role="img"
        >
          {demoTrend.map((point, index) => (
            <div className="trend-column" key={point.month}>
              <span
                className={`trend-bar ${index === demoTrend.length - 1 ? 'is-current' : ''}`}
                style={{ height: `${point.height}%` }}
              />
              <span className="trend-label">{point.month}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Profile({
  theme,
  hidden,
  onTheme,
  onHidden,
}: {
  theme: ThemeName;
  hidden: boolean;
  onTheme: (value: ThemeName) => void;
  onHidden: (value: boolean) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Configurações locais</p>
          <h1>Perfil e ajustes</h1>
          <p className="page-description">Preferências deste protótipo, sem conta autenticada.</p>
        </div>
      </div>
      <section className="settings-stack">
        <article className="panel settings-card">
          <div>
            <h2>Perfil demonstrativo</h2>
            <p>Davi · sessão ainda não configurada</p>
          </div>
          <span className="account-sharing">Somente local</span>
        </article>
        <article className="panel settings-card">
          <div>
            <h2>Ocultar valores</h2>
            <p>Esconde saldos e valores nas telas deste protótipo.</p>
          </div>
          <button
            aria-checked={hidden}
            aria-label="Ocultar valores"
            className={`switch ${hidden ? 'is-on' : ''}`}
            onClick={() => onHidden(!hidden)}
            role="switch"
            type="button"
          >
            <span />
          </button>
        </article>
        <article className="panel settings-card">
          <div>
            <h2>Aparência</h2>
            <p>Escolha uma visualização para esta sessão.</p>
          </div>
          <div className="theme-picker">
            {(['light', 'dark'] as const).map((value) => (
              <button
                aria-pressed={theme === value}
                className={`filter-chip ${theme === value ? 'is-selected' : ''}`}
                key={value}
                onClick={() => onTheme(value)}
                type="button"
              >
                {value === 'light' ? 'Claro' : 'Escuro'}
              </button>
            ))}
          </div>
        </article>
        <p className="inline-note">
          A interface ainda não usa autenticação nem persiste preferências. Não há dados bancários
          conectados.
        </p>
      </section>
    </>
  );
}

export function FinanceApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [hidden, setHidden] = useState(false);
  const [joint, setJoint] = useState(false);
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [theme, setTheme] = useState<ThemeName>('light');
  const [notice, setNotice] = useState('');
  const selectedTheme = themes[theme];
  const appStyle = {
    '--color-canvas': selectedTheme.canvas,
    '--color-surface': selectedTheme.surface,
    '--color-text': selectedTheme.text,
    '--color-muted': selectedTheme.muted,
    '--color-border': selectedTheme.border,
    '--color-accent': selectedTheme.accent,
    '--color-accent-soft': selectedTheme.accentSoft,
    '--color-positive': selectedTheme.positive,
    '--color-positive-soft': selectedTheme.positiveSoft,
    '--color-negative': selectedTheme.negative,
    '--radius-card': `${cornerRadius.large}px`,
    '--space-unit': `${spacing.md}px`,
  } as CSSProperties;

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  }

  function content() {
    switch (screen) {
      case 'home':
        return (
          <Dashboard
            hidden={hidden}
            joint={joint}
            onNewTransaction={() => notify('Protótipo: o lançamento não foi salvo.')}
            onOpenScreen={setScreen}
            onSetJoint={setJoint}
          />
        );
      case 'transactions':
        return (
          <Transactions
            filter={filter}
            hidden={hidden}
            onFilter={setFilter}
            onNewTransaction={() => notify('Protótipo: o lançamento não foi salvo.')}
          />
        );
      case 'accounts':
        return (
          <Accounts
            hidden={hidden}
            onConnect={() => notify('Nenhuma conexão criada. A integração ainda não existe.')}
          />
        );
      case 'analysis':
        return <Analysis hidden={hidden} />;
      case 'profile':
        return <Profile hidden={hidden} onHidden={setHidden} onTheme={setTheme} theme={theme} />;
    }
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
          <div className="sidebar-caption">ESPAÇO PESSOAL</div>
          <nav aria-label="Navegação principal" className="sidebar-nav">
            {navigation.map((item) => (
              <button
                aria-current={screen === item.id ? 'page' : undefined}
                className={`nav-item ${screen === item.id ? 'is-active' : ''}`}
                key={item.id}
                onClick={() => setScreen(item.id)}
                type="button"
              >
                <span aria-hidden="true" className="nav-indicator" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="user-avatar" aria-hidden="true">
              D
            </span>
            <span className="user-copy">
              <strong>Davi</strong>
              <span>Protótipo local</span>
            </span>
          </div>
        </aside>

        <div className="main-area">
          <header className="topbar">
            <span className="topbar-title">{screenTitles[screen]}</span>
            <div className="topbar-actions">
              <span className="demo-indicator">
                <span />
                Dados fictícios
              </span>
              <button
                aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                className="icon-button"
                onClick={() => setHidden(!hidden)}
                title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                type="button"
              >
                {hidden ? 'Mostrar' : 'Ocultar'}
              </button>
            </div>
          </header>
          <main className="page-content">{content()}</main>
          <nav aria-label="Navegação móvel" className="mobile-nav">
            {navigation.map((item) => (
              <button
                aria-current={screen === item.id ? 'page' : undefined}
                className={screen === item.id ? 'is-active' : ''}
                key={item.id}
                onClick={() => setScreen(item.id)}
                type="button"
              >
                <span aria-hidden="true" className="mobile-nav-dot" />
                <span>{item.shortLabel}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
