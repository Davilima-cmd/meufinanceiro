'use client';

import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, PageHeader } from '@/components/ui';
import { API_BASE, hasConfiguredApi } from '@/lib/api';
import { initialOf } from '@/lib/format';
import { useFinance } from '@/lib/store';

export default function SettingsPage() {
  const { snapshot, session, signOut, resetDemo, setHideValues, toggleTheme } = useFinance();
  const [notice, setNotice] = useState('');

  const user = session?.user;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Preferências"
        title="Configurações"
        description="Aparência, privacidade dos valores e informações da sessão."
      />

      <div className="settings-grid">
        <Card>
          <div className="card-heading">
            <div>
              <h2>Aparência</h2>
              <p>Ajustes salvos neste navegador</p>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Tema escuro</strong>
              <small>Alterna entre escuro e claro</small>
            </div>
            <button
              aria-label="Alternar tema"
              aria-pressed={snapshot.settings.theme === 'dark'}
              className={`switch ${snapshot.settings.theme === 'dark' ? 'is-on' : ''}`}
              onClick={toggleTheme}
              role="switch"
              type="button"
            />
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Ocultar valores</strong>
              <small>Mostra •••• no lugar dos saldos, útil em lugares públicos</small>
            </div>
            <button
              aria-label="Ocultar valores"
              aria-pressed={snapshot.settings.hideValues}
              className={`switch ${snapshot.settings.hideValues ? 'is-on' : ''}`}
              onClick={() => setHideValues(!snapshot.settings.hideValues)}
              role="switch"
              type="button"
            />
          </div>
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Sessão</h2>
              <p>Quem está usando este painel</p>
            </div>
            <Badge tone={session?.mode === 'demo' ? 'warning' : 'positive'}>
              {session?.mode === 'demo' ? 'demonstração' : 'API'}
            </Badge>
          </div>
          <div className="partner-row">
            <span aria-hidden="true" className="avatar">
              {initialOf(user?.name ?? '?')}
            </span>
            <span className="user-copy">
              <strong>{user?.name}</strong>
              <small>{user?.email}</small>
            </span>
          </div>
          <div className="stack" style={{ gap: 10, marginTop: 16 }}>
            <div className="mini-stat">
              <span>Modo</span>
              <strong>{session?.mode === 'demo' ? 'Dados de exemplo locais' : 'API real'}</strong>
            </div>
            <div className="mini-stat">
              <span>API configurada</span>
              <strong>{hasConfiguredApi() ? API_BASE : 'padrão local'}</strong>
            </div>
            <div className="entity-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="button button-ghost" onClick={() => void signOut()} type="button">
                Sair
              </button>
              {session?.mode === 'demo' ? (
                <button
                  className="button button-danger"
                  onClick={() => {
                    resetDemo();
                    setNotice('Dados de demonstração restaurados.');
                    window.setTimeout(() => setNotice(''), 2500);
                  }}
                  type="button"
                >
                  Restaurar dados de exemplo
                </button>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Privacidade e dados</h2>
              <p>Modelo de segurança do produto</p>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Contas privadas por padrão</strong>
              <small>Todo compartilhamento é explícito e reversível a qualquer momento</small>
            </div>
            <Badge tone="positive">ativo</Badge>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Valores em centavos</strong>
              <small>Sem arredondamento: cálculos feitos com inteiros</small>
            </div>
            <Badge tone="accent">inteiro</Badge>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Autenticação de dois fatores</strong>
              <small>
                {user?.mfaEnabled
                  ? 'Ativa nesta conta (código de 6 dígitos no app autenticador).'
                  : 'Desativada. Ativar protege o acesso mesmo se a senha vazar.'}
              </small>
            </div>
            <Badge tone={user?.mfaEnabled ? 'positive' : 'warning'}>
              {user?.mfaEnabled ? 'ativa' : 'inativa'}
            </Badge>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Seus dados são criptografados</strong>
              <small>
                Campos sensíveis (documento, conta, chave Pix) são guardados com AES-256-GCM; senhas
                usam argon2 e nunca aparecem para ninguém.
              </small>
            </div>
            <Badge tone="positive">ativo</Badge>
          </div>
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
