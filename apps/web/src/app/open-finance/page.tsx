'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { api, type ApiBankConnection } from '@/lib/api';
import { AppShell } from '@/components/app-shell';
import { type ApiAccount, type BankConnectionStatus } from '@meufinanceiro/shared-types';

type StatusInfo = { label: string; color: string; bg: string };

const STATUS_INFO: Record<BankConnectionStatus, StatusInfo> = {
  active: { label: 'Ativa', color: '#236b49', bg: '#e9f4f0' },
  awaiting_authorization: { label: 'Aguardando autorização', color: '#246b61', bg: '#e6f1ed' },
  expired: { label: 'Expirada', color: '#a34043', bg: '#fbeaea' },
  error: { label: 'Com erro', color: '#a34043', bg: '#fbeaea' },
  disconnected: { label: 'Desconectada', color: '#687572', bg: '#f2f5f3' },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(',', ' ·');
}

export default function OpenFinancePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [connections, setConnections] = useState<ApiBankConnection[]>([]);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [provider, setProvider] = useState('sandbox');
  const [providerAccountId, setProviderAccountId] = useState('');
  const [accountId, setAccountId] = useState('');

  const providers: { value: string; label: string }[] = [
    { value: 'sandbox', label: 'Sandbox (desenvolvimento)' },
    { value: 'caju', label: 'Caju (sandbox)' },
  ];

  useEffect(() => {
    setMounted(true);
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [conns, accts] = await Promise.all([api.getConnections(), api.getAccounts()]);
      setConnections(conns);
      setAccounts(accts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conexões');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    setError(null);
    setSyncing(true);
    try {
      await api.triggerSync();
      setToast({ kind: 'success', message: 'Sincronização iniciada' });
      await loadData();
    } catch (err) {
      setToast({ kind: 'error', message: apiErrorMessage(err) });
    } finally {
      setSyncing(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConnecting(true);
    try {
      await api.connectConnection({
        provider,
        providerAccountId: providerAccountId.trim(),
        accountId,
      });
      setProvider('sandbox');
      setProviderAccountId('');
      setAccountId('');
      setToast({ kind: 'success', message: 'Instituição conectada' });
      await loadData();
    } catch (err) {
      setToast({ kind: 'error', message: apiErrorMessage(err) });
    } finally {
      setConnecting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revogar esta conexão?')) return;
    try {
      await api.revokeConnection(id);
      setToast({ kind: 'success', message: 'Conexão revogada' });
      await loadData();
    } catch (err) {
      setToast({ kind: 'error', message: apiErrorMessage(err) });
    }
  };

  if (!mounted || (isLoading && !user)) {
    return null;
  }
  if (!user) {
    return null;
  }

  return (
    <AppShell title="Conexões Open Finance">
      {error && <p className="error-msg">{error}</p>}
      {toast && <div className="toast" role="status">{toast.message}</div>}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Open Finance · sandbox</p>
          <h1>Conexões bancárias</h1>
          <p className="page-description">
            Vincule instituições via Open Finance para importar movimentos automaticamente.
          </p>
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

      <section className="panel list-panel">
        <div className="page-heading">
          <div>
            <h2>Conectar uma instituição</h2>
            <p className="page-description">
              Informe o provedor, o identificador da conta na instituição e a conta do Meu Financeiro
              que receberá os movimentos.
            </p>
          </div>
        </div>
        <form onSubmit={handleConnect} className="create-account-form" style={{ gap: 10 }}>
          <select
            className="input"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            required
          >
            {providers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={providerAccountId}
            onChange={(e) => setProviderAccountId(e.target.value)}
            placeholder="ID da conta no provedor (ex: acc-123)"
            required
          />
          <select
            className="input"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            <option value="">Conta do Meu Financeiro</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}{account.institution ? ` (${account.institution})` : ''}
              </option>
            ))}
          </select>
          <button
            className="button button-primary"
            disabled={connecting || accounts.length === 0}
            type="submit"
          >
            {connecting ? 'Conectando…' : 'Conectar instituição'}
          </button>
          {accounts.length === 0 && (
            <p className="list-count">
              Cadastre uma conta em Contas antes de conectar uma instituição.
            </p>
          )}
        </form>
      </section>

      <section className="panel list-panel" style={{ marginTop: 16 }}>
        <div className="page-heading">
          <div>
            <h2>Suas conexões</h2>
            <p className="page-description">
              Status da conexão com a instituição e data da última sincronização.
            </p>
          </div>
        </div>
        {connections.length === 0 ? (
          <p className="list-count">Nenhuma instituição conectada.</p>
        ) : (
          <ul className="account-list" style={{ marginTop: 0 }}>
            {connections.map((connection) => {
              const info = STATUS_INFO[connection.status];
              return (
                <li key={connection.id} className="account-card" style={{ gap: 12 }}>
                  <span className="account-mark" aria-hidden="true">
                    {connection.provider.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="account-main" style={{ gap: 2 }}>
                    <span className="account-name">{connection.provider}</span>
                    <span className="account-detail">
                      {connection.providerAccountId} ·
                      {connection.account.name}
                    </span>
                  </div>
                  <span
                    className="account-sharing"
                    style={{
                      color: info.color,
                      background: info.bg,
                      border: '1px solid ' + info.color,
                    }}
                  >
                    {info.label}
                  </span>
                  <span className="account-note">
                    Última sincronização: {formatDateTime(connection.updatedAt)}
                  </span>
                  <button
                    className="text-button"
                    disabled={connection.status === 'disconnected'}
                    onClick={() => handleRevoke(connection.id)}
                    type="button"
                  >
                    Revogar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

/** Extrai mensagem legível de um erro da API, com fallback seguro. */
function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido';
}
