'use client';

import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, Money, PageHeader } from '@/components/ui';
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
  const { snapshot, session, setShareLevel } = useFinance();
  const [notice, setNotice] = useState('');
  const ownerId = session?.user.id ?? '';

  const mine = snapshot.accounts.filter((account) => account.ownerId === ownerId);
  const partnerAccounts = snapshot.accounts.filter((account) => account.ownerId !== ownerId);
  const jointVisible = snapshot.accounts.filter((account) => account.shareLevel !== 'private');
  const jointBalance = jointVisible.reduce(
    (sum, account) => sum + BigInt(account.balanceCents),
    0n
  );

  const sharedExpenses = snapshot.accounts
    .filter((account) => account.shareLevel === 'FULL')
    .reduce((sum, account) => sum + BigInt(account.balanceCents), 0n);

  function changeLevel(accountId: string, level: ShareLevel) {
    setShareLevel(accountId, level);
    const account = snapshot.accounts.find((item) => item.id === accountId);
    setNotice(
      `${account?.name ?? 'Conta'} agora está em “${LEVEL_LABEL[level]}”. O efeito é imediato para os dois.`
    );
    window.setTimeout(() => setNotice(''), 3000);
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
              <Badge tone={snapshot.partner ? 'positive' : 'warning'}>
                {snapshot.partner ? 'ativo' : 'sem parceria'}
              </Badge>
            </div>
            {snapshot.partner ? (
              <div className="partner-row">
                <span aria-hidden="true" className="avatar">
                  {initialOf(snapshot.partner.name)}
                </span>
                <span className="user-copy">
                  <strong>{snapshot.partner.name}</strong>
                  <small>{snapshot.partner.email}</small>
                </span>
                <Badge tone="accent">visão conjunta</Badge>
              </div>
            ) : (
              <p className="text-muted">Convide seu parceiro para começar a compartilhar contas.</p>
            )}
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
                  <Badge tone={account.shareLevel === 'private' ? 'neutral' : 'accent'}>
                    {LEVEL_LABEL[account.shareLevel]}
                  </Badge>
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
