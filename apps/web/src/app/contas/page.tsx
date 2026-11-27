'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Select, useDialog } from '@/components/dialog';
import { Badge, Card, EmptyState, Money, PageHeader } from '@/components/ui';
import {
  centsFromInput,
  formatBRL,
  monthKeyOf,
  currentMonthKey,
  sumCents,
  toCents,
} from '@/lib/format';
import { useFinance } from '@/lib/store';
import { api, type ApiAvailableAccountsResponse } from '@/lib/api';
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
  const { snapshot, session, addAccount, linkBankAccount, connectBank, deleteAccount } =
    useFinance();
  const dialog = useDialog();
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [initialBalance, setInitialBalance] = useState('');
  const [error, setError] = useState('');

  // Contas da instituição (Open Finance). `null` = ainda não perguntamos.
  const [available, setAvailable] = useState<ApiAvailableAccountsResponse | null>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  // O token do widget é pedido no clique (vale 30 min); não fica parado no
  // navegador esperando o usuário decidir.
  const [connecting, setConnecting] = useState(false);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);

  const isApi = session?.mode === 'api';

  async function loadAvailable() {
    setLoadingAvailable(true);
    setError('');
    try {
      const result = await api.getAvailableAccounts();
      setAvailable(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível consultar as instituições.');
    } finally {
      setLoadingAvailable(false);
    }
  }

  async function handleLink(providerAccountId: string) {
    setError('');
    setLinking(providerAccountId);
    // A conta é criada pela API a partir do que o banco informa: nome, tipo e
    // saldo não são digitados aqui.
    const failure = await linkBankAccount({
      provider: available?.provider ?? 'sandbox',
      providerAccountId,
    });
    setLinking(null);
    if (failure) {
      setError(failure);
      return;
    }
    void loadAvailable();
  }

  /**
   * Conectar banco de verdade: token → widget de consentimento → item →
   * importação das contas e do histórico. Nada é digitado no app.
   */
  async function handleConnectBank() {
    setError('');
    setConnectNotice(null);
    setConnecting(true);
    const failure = await connectBank(async (token) => {
      const { openConnectWidget } = await import('@/components/connect-bank');
      const result = await openConnectWidget({ connectToken: token });
      if (result.error) {
        setError(result.error);
        return null;
      }
      return result.itemId;
    });
    setConnecting(false);
    if (failure) {
      setError(failure);
      return;
    }
    setConnectNotice('Banco conectado. As contas e os lançamentos já estão sendo importados.');
    setAvailable(null);
    void loadAvailable();
  }

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Dê um nome à conta.');
      return;
    }
    /**
     * Saldo inicial: sem ele, uma conta manual nasce com R$ 0,00 e o usuário
     * não tem como dizer o que já tem no banco — o produto inteiro passa a
     * mostrar um patrimônio que não existe. O valor vira o lançamento
     * "Saldo inicial" na API (saldo continua derivado do histórico).
     */
    const balanceCents = centsFromInput(initialBalance);
    const failure = await addAccount({
      name,
      institution,
      type,
      shareLevel: 'private',
      ...(balanceCents !== 0n ? { balanceCents: balanceCents.toString() } : {}),
    });
    if (failure) {
      setError(failure);
      return;
    }
    setName('');
    setInstitution('');
    setType('checking');
    setInitialBalance('');
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
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      {own ? null : <Badge tone="warning">somente leitura</Badge>}
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
                          if (!confirmed) return;
                          void deleteAccount(account.id).then((failure) => {
                            if (failure) setError(failure);
                          });
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
              <h2>Vincular conta bancária</h2>
              <p>
                A conta é criada com os dados da instituição (nome, tipo e saldo) e passa a ser
                atualizada pelo Open Finance. Você não digita nada.
              </p>
            </div>
          </div>
          {!isApi ? (
            <p className="account-sub">
              O vínculo com bancos exige uma conta real. No modo demonstração, use &ldquo;Conta
              manual&rdquo; abaixo.
            </p>
          ) : (
            <div className="stack">
              <p className="account-sub">
                Você autoriza o banco pelo Open Finance e nós importamos saldo e lançamentos. Sua
                senha do banco é digitada no ambiente do banco, nunca aqui.
              </p>
              <div className="page-actions">
                <button
                  className="button button-primary"
                  disabled={connecting}
                  onClick={() => void handleConnectBank()}
                  type="button"
                >
                  {connecting ? 'Abrindo autorização do banco…' : 'Conectar banco (Open Finance)'}
                </button>
                <button
                  className="button"
                  disabled={loadingAvailable}
                  onClick={() => void loadAvailable()}
                  type="button"
                >
                  {loadingAvailable ? 'Consultando…' : 'Ver contas já autorizadas'}
                </button>
              </div>
              {connectNotice ? <p className="account-sub">{connectNotice}</p> : null}
            </div>
          )}
          {!isApi ? null : available === null ? null : !available.available ? (
            <p className="account-sub">
              {available.reason ??
                'A integração automática com bancos ainda não está liberada neste ambiente.'}
            </p>
          ) : available.accounts.length === 0 ? (
            <p className="account-sub">
              Nenhuma conta nova encontrada nas instituições conectadas.
            </p>
          ) : (
            <div className="stack">
              {available.accounts.map((item) => (
                <div
                  className="form-row"
                  key={item.providerAccountId}
                  style={{ alignItems: 'center' }}
                >
                  <div>
                    <div className="account-name">{item.name}</div>
                    <div className="account-sub">
                      {item.institution ?? item.type} · <Money value={item.balanceCents} />
                    </div>
                  </div>
                  <div className="page-actions" style={{ marginLeft: 'auto' }}>
                    <button
                      className="button button-primary"
                      disabled={item.alreadyLinked || linking === item.providerAccountId}
                      onClick={() => void handleLink(item.providerAccountId)}
                      type="button"
                    >
                      {item.alreadyLinked
                        ? 'Já vinculada'
                        : linking === item.providerAccountId
                          ? 'Vinculando…'
                          : 'Vincular'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Conta manual</h2>
              <p>
                Para dinheiro em espécie, carteira ou um banco sem integração. A conta começa
                privada e com saldo zero.
              </p>
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
              <label className="field">
                <span>Saldo atual (opcional)</span>
                <input
                  aria-describedby="initial-balance-hint"
                  className="input"
                  inputMode="decimal"
                  onChange={(event) => setInitialBalance(event.target.value)}
                  placeholder="0,00"
                  value={initialBalance}
                />
              </label>
            </div>
            <p className="text-muted" id="initial-balance-hint" style={{ fontSize: 12 }}>
              Quanto já existe nesta conta hoje.
              {centsFromInput(initialBalance) !== 0n
                ? ` Vira o lançamento “Saldo inicial” de ${formatBRL(centsFromInput(initialBalance))}.`
                : ' Em branco, começa em R$ 0,00.'}{' '}
              Em cartão de crédito, informe o valor negativo da fatura.
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="page-actions">
              <button className="button button-primary" type="submit">
                Criar conta manual
              </button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
