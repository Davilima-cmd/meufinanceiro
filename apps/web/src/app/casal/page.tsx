'use client';

import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, Money, PageHeader } from '@/components/ui';
import { isOwnAccount } from '@/lib/account-access';
import { initialOf, percentOf } from '@/lib/format';
import { useFinance } from '@/lib/store';
import type { ShareLevel } from '@/lib/types';

const LEVEL_LABEL: Record<ShareLevel, string> = {
  private: 'Privada',
  BALANCE_ONLY: 'Só saldo',
  FULL: 'Histórico',
};

/**
 * Tela de compartilhamento: mostra o modelo de privacidade do produto
 * (toda conta nasce privada, o dono escolhe o nível) e permite alternar
 * o nível de cada conta diretamente.
 */
export default function CouplePage() {
  const {
    snapshot,
    session,
    isDemo,
    setShareLevel,
    invitePartner,
    acceptPartnership,
    revokePartnership,
  } = useFinance();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const ownerId = session?.user.id ?? '';

  const mine = snapshot.accounts.filter((account) => isOwnAccount(account, ownerId));
  const partnerAccounts = snapshot.accounts.filter((account) => !isOwnAccount(account, ownerId));
  const jointVisible = snapshot.accounts.filter((account) => account.shareLevel !== 'private');
  const jointBalance = jointVisible.reduce(
    (sum, account) => sum + BigInt(account.balanceCents),
    0n
  );

  const sharedExpenses = snapshot.accounts
    .filter((account) => account.shareLevel === 'FULL')
    .reduce((sum, account) => sum + BigInt(account.balanceCents), 0n);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4000);
  }

  async function changeLevel(accountId: string, level: ShareLevel) {
    const account = snapshot.accounts.find((item) => item.id === accountId);
    const name = account?.name ?? 'Conta';
    setError('');
    setBusy(true);
    const failure = await setShareLevel(accountId, level);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    flash(`${name} agora está em “${LEVEL_LABEL[level]}”. O efeito é imediato para os dois.`);
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!email.includes('@')) {
      setError('Informe o e-mail da pessoa que você quer convidar.');
      return;
    }
    setBusy(true);
    const failure = await invitePartner(email.trim());
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEmail('');
    flash('Convite enviado. A parceria libera o compartilhamento quando for aceita.');
  }

  async function handleAccept() {
    setError('');
    setBusy(true);
    const failure = await acceptPartnership();
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    flash('Parceria aceita. Agora vocês podem compartilhar contas.');
  }

  async function handleRevoke() {
    setError('');
    setBusy(true);
    const failure = await revokePartnership();
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    flash('Parceria desfeita: todos os compartilhamentos foram revogados.');
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Privacidade primeiro"
        title="Vocês dois"
        description="Cada pessoa controla as próprias contas. Compartilhar é uma escolha reversível, com efeito imediato."
      />

      <div className="stack">
        <div className="grid grid-2">
          <Card>
            <div className="card-heading">
              <div>
                <h2>Parceria</h2>
                <p>Vínculo entre as duas contas</p>
              </div>
              <Badge
                tone={
                  snapshot.partner
                    ? snapshot.partner.status === 'accepted'
                      ? 'positive'
                      : 'warning'
                    : 'warning'
                }
              >
                {snapshot.partner
                  ? snapshot.partner.status === 'accepted'
                    ? 'ativo'
                    : 'convite pendente'
                  : 'sem parceria'}
              </Badge>
            </div>
            {snapshot.partner ? (
              <div className="partner-row">
                <span aria-hidden="true" className="avatar">
                  {initialOf(snapshot.partner.name)}
                </span>
                <span className="user-copy">
                  <strong>{snapshot.partner.name}</strong>
                  <small>{snapshot.partner.email || 'parceria ativa'}</small>
                </span>
                <Badge tone="accent">
                  {snapshot.partner.status === 'accepted' ? 'visão conjunta' : 'aguardando'}
                </Badge>
              </div>
            ) : (
              <p className="text-muted">Convide seu parceiro para começar a compartilhar contas.</p>
            )}

            <form className="stack" onSubmit={handleInvite} style={{ gap: 8, marginTop: 16 }}>
              <label className="field">
                <span>Convidar pelo e-mail</span>
                <input
                  aria-label="E-mail do parceiro"
                  className="input"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="parceiro@email.com"
                  type="email"
                  value={email}
                />
              </label>
              <div className="goal-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
                <button className="button button-primary" disabled={busy} type="submit">
                  Enviar convite
                </button>
                {snapshot.partner?.status === 'accepted' ? (
                  <button
                    className="button button-ghost"
                    disabled={busy}
                    onClick={handleRevoke}
                    type="button"
                  >
                    Desfazer parceria
                  </button>
                ) : null}
                {!isDemo && snapshot.partner ? (
                  <button
                    className="button button-ghost"
                    disabled={busy}
                    onClick={handleAccept}
                    type="button"
                  >
                    Aceitar convite recebido
                  </button>
                ) : null}
              </div>
              {error ? (
                <p className="field-hint" role="alert" style={{ color: 'var(--danger, #ef4444)' }}>
                  {error}
                </p>
              ) : null}
            </form>
            <div className="stack" style={{ gap: 10, marginTop: 16 }}>
              <div className="mini-stat">
                <span>Saldo das contas compartilhadas</span>
                <strong>
                  <Money value={jointBalance} />
                </strong>
              </div>
              <div className="mini-stat">
                <span>Contas com histórico liberado</span>
                <strong>{snapshot.accounts.filter((a) => a.shareLevel === 'FULL').length}</strong>
              </div>
              <div className="mini-stat">
                <span>Saldo das contas privadas</span>
                <strong>
                  <Money
                    value={snapshot.accounts
                      .filter((account) => account.shareLevel === 'private')
                      .reduce((sum, account) => sum + BigInt(account.balanceCents), 0n)}
                  />
                </strong>
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-heading">
              <div>
                <h2>Como funciona</h2>
                <p>Três níveis de acesso por conta</p>
              </div>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <div className="settings-row">
                <div className="settings-row-copy">
                  <strong>Privada</strong>
                  <small>Só você vê o saldo e os lançamentos.</small>
                </div>
                <Badge tone="neutral">padrão</Badge>
              </div>
              <div className="settings-row">
                <div className="settings-row-copy">
                  <strong>Só saldo</strong>
                  <small>O parceiro vê o saldo, sem histórico de lançamentos.</small>
                </div>
                <Badge tone="accent">BALANCE_ONLY</Badge>
              </div>
              <div className="settings-row">
                <div className="settings-row-copy">
                  <strong>Histórico</strong>
                  <small>O parceiro vê saldo e lançamentos, somente leitura.</small>
                </div>
                <Badge tone="positive">FULL</Badge>
              </div>
              <p className="auth-note">
                {percentOf(BigInt(Math.round(Number(sharedExpenses))), jointBalance || 1n) >= 0
                  ? 'A visão conjunta soma apenas contas compartilhadas e respeita o nível de cada uma.'
                  : ''}
              </p>
            </div>
          </Card>
        </div>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Suas contas</h2>
              <p>Escolha o que {snapshot.partner?.name ?? 'seu parceiro'} pode ver</p>
            </div>
          </div>
          <div className="share-list">
            {mine.length === 0 ? (
              <p className="text-muted">Você ainda não cadastrou contas.</p>
            ) : (
              mine.map((account) => (
                <div className="share-item" key={account.id}>
                  <span className="row-copy">
                    <strong>{account.name}</strong>
                    <small>
                      <Money value={account.balanceCents} /> ·{' '}
                      {account.institution ?? 'sem instituição'}
                    </small>
                  </span>
                  <div
                    className="share-levels"
                    role="group"
                    aria-label={`Nível de ${account.name}`}
                  >
                    {(['private', 'BALANCE_ONLY', 'FULL'] as ShareLevel[]).map((level) => (
                      <button
                        aria-pressed={account.shareLevel === level}
                        className={account.shareLevel === level ? 'is-active' : ''}
                        key={level}
                        onClick={() => changeLevel(account.id, level)}
                        type="button"
                      >
                        {LEVEL_LABEL[level]}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Contas do parceiro</h2>
              <p>O que {snapshot.partner?.name ?? 'seu parceiro'} compartilhou com você</p>
            </div>
          </div>
          <div className="share-list">
            {partnerAccounts.length === 0 ? (
              <p className="text-muted">Nenhuma conta compartilhada ainda.</p>
            ) : (
              partnerAccounts.map((account) => (
                <div className="share-item" key={account.id}>
                  <span className="row-copy">
                    <strong>{account.name}</strong>
                    <small>
                      <Money value={account.balanceCents} /> · de {account.ownerName}
                    </small>
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge tone="warning">somente leitura</Badge>
                    <Badge tone={account.shareLevel === 'private' ? 'neutral' : 'accent'}>
                      {LEVEL_LABEL[account.shareLevel]}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="auth-note" style={{ marginTop: 12 }}>
            Apenas o dono altera o nível da própria conta. Você nunca edita dados das contas dele.
          </p>
        </Card>
      </div>

      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}
    </AppShell>
  );
}
