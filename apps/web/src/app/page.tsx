'use client';

import { useMemo, useState } from 'react';

type Section = 'home' | 'movements' | 'accounts' | 'analysis' | 'profile';
type AccountView = 'personal' | 'joint';

const navigation: Array<{ id: Section; label: string }> = [
  { id: 'home', label: 'Início' },
  { id: 'movements', label: 'Movimentações' },
  { id: 'accounts', label: 'Contas' },
  { id: 'analysis', label: 'Análises' },
  { id: 'profile', label: 'Perfil e preferências' },
];

const accounts = [
  {
    name: 'Conta do dia a dia',
    institution: 'Banco Horizonte · fictício',
    kind: 'Conta corrente',
    owner: 'Minha conta',
    sharing: 'Privada',
    balanceCents: 527840n,
    updated: 'Hoje, 08:42',
  },
  {
    name: 'Reserva tranquila',
    institution: 'Cooperativa Aurora · fictícia',
    kind: 'Carteira manual',
    owner: 'Minha conta',
    sharing: 'Privada',
    balanceCents: 680000n,
    updated: 'Atualizada manualmente',
  },
  {
    name: 'Reserva compartilhada',
    institution: 'Banco Horizonte · fictício',
    kind: 'Conta poupança',
    owner: 'Conta da parceira',
    sharing: 'BALANCE_ONLY',
    balanceCents: 195000n,
    updated: 'Hoje, 08:42',
  },
];

const transactions = [
  {
    id: 't1',
    title: 'Mercado da semana',
    category: 'Alimentação',
    account: 'Conta do dia a dia',
    date: '31 out',
    amountCents: -6842n,
    origin: 'Manual',
  },
  {
    id: 't2',
    title: 'Salário',
    category: 'Salário',
    account: 'Conta do dia a dia',
    date: '30 out',
    amountCents: 642000n,
    origin: 'Demonstração',
  },
  {
    id: 't3',
    title: 'Transporte por aplicativo',
    category: 'Transporte',
    account: 'Conta do dia a dia',
    date: '29 out',
    amountCents: -3240n,
    origin: 'Demonstração',
  },
  {
    id: 't4',
    title: 'Conta de energia',
    category: 'Moradia',
    account: 'Conta do dia a dia',
    date: '28 out',
    amountCents: -15890n,
    origin: 'Manual',
  },
  {
    id: 't5',
    title: 'Farmácia',
    category: 'Saúde',
    account: 'Conta do dia a dia',
    date: '27 out',
    amountCents: -4325n,
    origin: 'Demonstração',
  },
];

const categories = [
  { name: 'Moradia', amountCents: 148000n, percent: 76, color: 'var(--accent)' },
  { name: 'Alimentação', amountCents: 96300n, percent: 62, color: 'var(--mint)' },
  { name: 'Transporte', amountCents: 52400n, percent: 48, color: 'var(--amber)' },
  { name: 'Saúde', amountCents: 31600n, percent: 37, color: 'var(--violet)' },
];

const monthlySpending = [
  { label: 'Mai', height: 45 },
  { label: 'Jun', height: 61 },
  { label: 'Jul', height: 52 },
  { label: 'Ago', height: 72 },
  { label: 'Set', height: 59 },
  { label: 'Out', height: 78 },
];

function formatBRL(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '- ' : ''}R$ ${whole},${fraction}`;
}

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">MEU FINANCEIRO</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      <span className="date-chip">Outubro de 2026</span>
    </div>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>('home');
  const [accountView, setAccountView] = useState<AccountView>('personal');
  const [valuesHidden, setValuesHidden] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');

  const visibleAccounts = accountView === 'personal' ? accounts.slice(0, 2) : accounts;
  const balanceCents = visibleAccounts.reduce((total, account) => total + account.balanceCents, 0n);
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const matchesQuery = `${transaction.title} ${transaction.account}`
          .toLocaleLowerCase('pt-BR')
          .includes(query.toLocaleLowerCase('pt-BR'));
        const matchesCategory =
          categoryFilter === 'Todas' || transaction.category === categoryFilter;
        return matchesQuery && matchesCategory;
      }),
    [categoryFilter, query]
  );
  const money = (cents: bigint) => (valuesHidden ? '••••••' : formatBRL(cents));

  return (
    <div className="app-shell" data-theme={darkMode ? 'dark' : 'light'}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setSection('home');
          }}
        >
          <span className="brand-mark">m</span>
          <span>
            meu<span className="brand-light">financeiro</span>
          </span>
        </a>
        <div className="demo-pill">
          <span /> Ambiente de demonstração
        </div>
        <p className="nav-label">MENU</p>
        <nav aria-label="Navegação principal">
          {navigation.map((item, index) => (
            <button
              className={`nav-item ${section === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
            >
              <span className="nav-number">0{index + 1}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="note-icon">i</span>
            <p>Os valores exibidos são fictícios e não representam contas bancárias reais.</p>
          </div>
          <div className="user-chip">
            <span className="avatar">D</span>
            <span>
              <strong>Perfil de demonstração</strong>
              <small>Sem conexão bancária</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="demo-banner">
          <span className="banner-dot" />
          <span>DEMONSTRAÇÃO</span>
          <span className="banner-divider" />
          Dados fictícios · nenhuma instituição conectada
        </div>

        {section === 'home' && (
          <>
            <PageHeading
              title="Um olhar tranquilo sobre suas finanças."
              subtitle="Tudo organizado em um só lugar."
            />
            <div className="view-switch" role="group" aria-label="Visão das contas">
              <button
                className={accountView === 'personal' ? 'selected' : ''}
                onClick={() => setAccountView('personal')}
              >
                Minhas contas
              </button>
              <button
                className={accountView === 'joint' ? 'selected' : ''}
                onClick={() => setAccountView('joint')}
              >
                Visão conjunta <span className="tiny-lock">demo</span>
              </button>
            </div>

            <section className="balance-card" aria-label="Saldo consolidado demonstrativo">
              <div className="balance-top">
                <div>
                  <p className="balance-label">
                    SALDO CONSOLIDADO{' '}
                    <span className="info-dot" title="Soma das contas incluídas nesta visão.">
                      i
                    </span>
                  </p>
                  <p className="balance-amount">{money(balanceCents)}</p>
                </div>
                <button
                  className="icon-button balance-visibility"
                  onClick={() => setValuesHidden(!valuesHidden)}
                  aria-label={valuesHidden ? 'Mostrar valores' : 'Ocultar valores'}
                >
                  {valuesHidden ? '◉' : '◎'}
                </button>
              </div>
              <div className="balance-bottom">
                <span>
                  <span className="status-dot" /> Valores fictícios, sem sincronização real
                </span>
                <span>{visibleAccounts.length} contas na visão</span>
              </div>
            </section>

            <section className="summary-grid" aria-label="Resumo de outubro">
              <article className="summary-card">
                <span className="summary-icon income-icon">↗</span>
                <p>Receitas do período</p>
                <strong>{money(642000n)}</strong>
                <small>Outubro · demonstração</small>
              </article>
              <article className="summary-card">
                <span className="summary-icon expense-icon">↘</span>
                <p>Despesas do período</p>
                <strong>{money(387000n)}</strong>
                <small>Outubro · demonstração</small>
              </article>
              <article className="summary-card">
                <span className="summary-icon saved-icon">◇</span>
                <p>Saldo do período</p>
                <strong>{money(255000n)}</strong>
                <small>Receitas menos despesas</small>
              </article>
            </section>

            <div className="content-grid">
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Como seus gastos caminham</h2>
                    <p>Despesas mensais · dados fictícios</p>
                  </div>
                  <span className="legend">
                    <i /> Total de despesas
                  </span>
                </div>
                <div
                  className="chart"
                  role="img"
                  aria-label="Gráfico ilustrativo de despesas de maio a outubro"
                >
                  <div className="chart-grid">
                    {[0, 1, 2, 3].map((line) => (
                      <span key={line} />
                    ))}
                  </div>
                  <div className="bars">
                    {monthlySpending.map((month) => (
                      <div className="bar-column" key={month.label}>
                        <div
                          className={`bar ${month.label === 'Out' ? 'current' : ''}`}
                          style={{ height: `${month.height}%` }}
                          title={`${month.label}: valor demonstrativo`}
                        />
                        <span>{month.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <section className="panel categories-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Onde o dinheiro vai</h2>
                    <p>Principais categorias do mês</p>
                  </div>
                  <button className="text-button" onClick={() => setSection('analysis')}>
                    Ver análise <span>→</span>
                  </button>
                </div>
                <div className="category-list">
                  {categories.map((category) => (
                    <div className="category-item" key={category.name}>
                      <div className="category-copy">
                        <span>{category.name}</span>
                        <strong>{money(category.amountCents)}</strong>
                      </div>
                      <div className="progress-track">
                        <span
                          style={{ width: `${category.percent}%`, background: category.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="panel recent-panel">
              <div className="panel-heading">
                <div>
                  <h2>Movimentações recentes</h2>
                  <p>Exemplos fictícios para navegar pelo protótipo</p>
                </div>
                <button className="text-button" onClick={() => setSection('movements')}>
                  Ver todas <span>→</span>
                </button>
              </div>
              <TransactionList items={transactions.slice(0, 4)} money={money} />
            </section>
          </>
        )}

        {section === 'movements' && (
          <>
            <PageHeading
              title="Movimentações"
              subtitle="Uma visão organizada dos lançamentos de exemplo."
            />
            <section className="panel movements-panel">
              <div className="filters">
                <label className="search-field">
                  <span aria-hidden="true">⌕</span>
                  <span className="sr-only">Pesquisar movimentações</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar lançamento ou conta"
                  />
                </label>
                <label className="filter-field">
                  <span className="sr-only">Filtrar por categoria</span>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                  >
                    <option>Todas</option>
                    {categories.map((category) => (
                      <option key={category.name}>{category.name}</option>
                    ))}
                    <option>Salário</option>
                  </select>
                </label>
              </div>
              <p className="results-label">
                {filteredTransactions.length} lançamentos · dados fictícios
              </p>
              {filteredTransactions.length > 0 ? (
                <TransactionList items={filteredTransactions} money={money} />
              ) : (
                <div className="empty-state">
                  <strong>Nenhum lançamento encontrado</strong>
                  <span>Ajuste a busca ou escolha outra categoria.</span>
                </div>
              )}
            </section>
          </>
        )}

        {section === 'accounts' && (
          <>
            <PageHeading
              title="Contas e carteiras"
              subtitle="Contas demonstrativas e seus níveis de compartilhamento."
            />
            <div className="account-notice">
              <strong>Privacidade primeiro.</strong> Contas são privadas por padrão. O
              compartilhamento abaixo é apenas ilustrativo.
            </div>
            <section className="account-grid">
              {accounts.map((account) => (
                <article className="panel account-card" key={account.name}>
                  <div className="account-card-top">
                    <span className="account-symbol">
                      {account.kind === 'Carteira manual' ? '◇' : 'M'}
                    </span>
                    <span
                      className={`share-badge ${account.sharing === 'Privada' ? 'private' : 'shared'}`}
                    >
                      {account.sharing}
                    </span>
                  </div>
                  <p className="account-owner">{account.owner}</p>
                  <h2>{account.name}</h2>
                  <p className="muted">{account.institution}</p>
                  <div className="account-balance">{money(account.balanceCents)}</div>
                  <div className="account-meta">
                    <span>{account.kind}</span>
                    <span>{account.updated}</span>
                  </div>
                  {account.sharing === 'BALANCE_ONLY' && (
                    <p className="account-permission">
                      Saldo visível na visão conjunta. Transações não são compartilhadas.
                    </p>
                  )}
                </article>
              ))}
            </section>
          </>
        )}

        {section === 'analysis' && (
          <>
            <PageHeading
              title="Análises"
              subtitle="Acompanhe padrões de gastos sem perder de vista o contexto."
            />
            <section className="panel analysis-panel">
              <div className="panel-heading">
                <div>
                  <h2>Despesas por categoria</h2>
                  <p>Outubro · valores ilustrativos</p>
                </div>
                <span className="date-chip">Este mês</span>
              </div>
              {categories.map((category) => (
                <div className="analysis-category" key={category.name}>
                  <div className="category-copy">
                    <span>{category.name}</span>
                    <strong>{money(category.amountCents)}</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${category.percent}%`, background: category.color }} />
                  </div>
                  <small>{category.percent}% do limite demonstrativo</small>
                </div>
              ))}
            </section>
            <div className="analysis-footnote">
              Os limites e valores desta tela são fictícios. Orçamentos e metas serão conectados a
              dados reais em uma fase posterior.
            </div>
          </>
        )}

        {section === 'profile' && (
          <>
            <PageHeading
              title="Perfil e preferências"
              subtitle="Ajustes deste protótipo, armazenados apenas nesta tela."
            />
            <section className="panel preferences-panel">
              <div className="preference-row">
                <div>
                  <strong>Ocultar valores</strong>
                  <p>Esconda os valores financeiros exibidos na tela.</p>
                </div>
                <button
                  className={`toggle ${valuesHidden ? 'on' : ''}`}
                  onClick={() => setValuesHidden(!valuesHidden)}
                  role="switch"
                  aria-checked={valuesHidden}
                  aria-label="Ocultar valores"
                >
                  <span />
                </button>
              </div>
              <div className="preference-row">
                <div>
                  <strong>Tema escuro</strong>
                  <p>Altere o tema visual deste protótipo.</p>
                </div>
                <button
                  className={`toggle ${darkMode ? 'on' : ''}`}
                  onClick={() => setDarkMode(!darkMode)}
                  role="switch"
                  aria-checked={darkMode}
                  aria-label="Tema escuro"
                >
                  <span />
                </button>
              </div>
              <div className="profile-demo-note">
                <strong>Conta de demonstração</strong>
                <span>Login, sessões e dados pessoais ainda não estão conectados a uma API.</span>
              </div>
            </section>
          </>
        )}

        <footer className="app-footer">
          MEU FINANCEIRO <span>·</span> Protótipo navegável com dados exclusivamente fictícios
        </footer>
      </main>
    </div>
  );
}

function TransactionList({
  items,
  money,
}: {
  items: typeof transactions;
  money: (cents: bigint) => string;
}) {
  return (
    <div className="transaction-list">
      {items.map((transaction) => (
        <div className="transaction-row" key={transaction.id}>
          <span className={`transaction-icon ${transaction.amountCents > 0n ? 'positive' : ''}`}>
            {transaction.amountCents > 0n ? '↗' : '↘'}
          </span>
          <span className="transaction-description">
            <strong>{transaction.title}</strong>
            <small>
              {transaction.category} · {transaction.account}
            </small>
          </span>
          <span className="transaction-origin">{transaction.origin}</span>
          <span className="transaction-date">{transaction.date}</span>
          <strong
            className={`transaction-value ${transaction.amountCents > 0n ? 'positive-text' : ''}`}
          >
            {money(transaction.amountCents)}
          </strong>
        </div>
      ))}
    </div>
  );
}
