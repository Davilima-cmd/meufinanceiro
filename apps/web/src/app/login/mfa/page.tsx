'use client'; /* eslint-disable react-hooks/set-state-in-effect -- hidratação/redirecionamento exclusivo do cliente (localStorage/sessionStorage) */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { withTimeout } from '@/lib/api';
import type { AuthResponse } from '@meufinanceiro/shared-types';

export default function MfaLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('mf.mfa.temp');
    setHasSession(Boolean(token));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const tempToken = sessionStorage.getItem('mf.mfa.temp');
      if (!tempToken) throw new Error('Sessão expirada. Entre novamente.');
      const { api } = await import('@/lib/api');
      const result: AuthResponse = await withTimeout(api.mfaVerify({ code }, tempToken), 8000);
      if (!result.token) throw new Error('Resposta inválida da API.');
      // O token temporário só serviu para o segundo fator; a sessão definitiva
      // chegou no cookie `HttpOnly`, inacessível ao JavaScript.
      sessionStorage.removeItem('mf.mfa.temp');
      sessionStorage.removeItem('mf.mfa.email');
      localStorage.setItem('mf.session.api', JSON.stringify({}));
      router.push('/api');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-showcase">
        <div className="brand">
          <span aria-hidden="true" className="brand-mark">
            mf
          </span>
          <span className="brand-text">
            meu financeiro
            <small>finanças a dois</small>
          </span>
        </div>
        <div className="stack">
          <p className="eyebrow">Verificação em duas etapas</p>
          <h2>Digite o código do seu aplicativo autenticador.</h2>
          <p>O código tem 6 dígitos e muda a cada 30 segundos.</p>
        </div>
        <p className="auth-note">Protótipo · dados fictícios.</p>
      </aside>
      <div className="auth-form-wrap">
        <div className="auth-card">
          <h1>Confirmar código</h1>
          {hasSession ? (
            <form onSubmit={handleSubmit}>
              <label className="field">
                <span>Código de 6 dígitos</span>
                <input
                  autoComplete="one-time-code"
                  className="input input-amount"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  value={code}
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button
                className="button button-primary"
                disabled={submitting || code.length !== 6}
                type="submit"
              >
                {submitting ? 'Verificando…' : 'Confirmar'}
              </button>
            </form>
          ) : (
            <p className="page-description">
              Não há verificação pendente.{' '}
              <Link className="link-button" href="/login">
                Voltar ao login
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
