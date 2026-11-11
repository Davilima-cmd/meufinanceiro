'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiErrorMessage, useAuth } from '@/contexts/auth-context';

export default function MfaVerifyPage() {
  const { mfaTempToken, mfaVerify } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sem token de sessão MFA (ex.: acesso direto à URL) → volta para o login.
  useEffect(() => {
    if (!mfaTempToken) {
      router.replace('/login');
    }
  }, [mfaTempToken, router]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Digite os 6 dígitos do código de verificação.');
      return;
    }
    setSubmitting(true);
    mfaVerify(code)
      .then(() => router.push('/'))
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setSubmitting(false));
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Verificação em duas etapas</h1>
        <p className="page-description">
          Insira o código de 6 dígitos do seu app autenticador para concluir o login.
        </p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>
            Código de 6 dígitos
            <input
              autoFocus
              inputMode="numeric"
              pattern="\d{0,6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Verificando…' : 'Concluir login'}
          </button>
        </form>
        <p className="note">Não recebeu o código? Solicite um novo login e tente novamente.</p>
        <a href="/login" className="back-link">
          ← Voltar ao login
        </a>
      </div>
    </div>
  );
}
