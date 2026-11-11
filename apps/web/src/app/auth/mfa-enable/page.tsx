'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toDataURL } from 'qrcode';
import { api } from '@/lib/api';
import { useAuth, apiErrorMessage } from '@/contexts/auth-context';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Gera um segredo base32 aleatório (RFC 4648), equivalente ao speakeasy. */
function generateBase32Secret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  while (output.length % 8 !== 0) output += '=';
  return output;
}

export default function MfaEnablePage() {
  const { user, mfaEnable } = useAuth();
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [otpAuthUrl, setOtpAuthUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Já ativado? Não há o que configurar aqui.
  useEffect(() => {
    if (user?.mfaEnabled) {
      router.push('/');
    }
  }, [user?.mfaEnabled, router]);

  // Gera o segredo (somente na memória), pede o QR code ao servidor e exibe.
  // O segredo TOTP nunca é gravado no localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const generated = generateBase32Secret();
        if (cancelled) return;
        setSecret(generated);
        const email = user?.email ?? 'usuario@meufinanceiro';
        const otpauthUrl = `otpauth://totp/Meu%20Financeiro:${encodeURIComponent(email)}?secret=${generated}&issuer=Meu%20Financeiro`;
        setOtpAuthUrl(otpauthUrl);

        const server = await api.mfaQrCode(generated);
        if (cancelled) return;
        setQrDataUrl(server.qrCode ?? null);
        if (!server.qrCode && server.otpAuthUrl) {
          const dataUrl = await toDataURL(server.otpAuthUrl, {
            width: 260,
            margin: 2,
            color: { dark: '#246b61', light: '#ffffff' },
          });
          if (!cancelled) setQrDataUrl(dataUrl);
        }
      } catch (err) {
        setError(apiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!secret || !/^\d{6}$/.test(code)) {
      setError('Digite os 6 dígitos do código gerado pelo app autenticador.');
      return;
    }
    setSubmitting(true);
    mfaEnable(secret, code)
      .then(() => router.push('/'))
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setSubmitting(false));
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Ativar verificação em duas etapas</h1>
          <div className="loading">Gerando QR code…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Ativar verificação em duas etapas</h1>
          <p className="error">{error}</p>
          <a href="/auth/mfa-enable" className="back-link">
            Tentar novamente
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Ativar verificação em duas etapas</h1>
        <p className="page-description">
          Abra o app autenticador (Google Authenticator, Authy ou similar),{' '}
          <strong>digitalize o QR code abaixo</strong> e digite o código de 6 dígitos.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
          {qrDataUrl && (
            <img
              alt="QR code para configuração do MFA"
              src={qrDataUrl}
              style={{
                width: 200,
                height: 200,
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                background: '#fff',
              }}
            />
          )}
        </div>
        <p className="note">
          Não conseguiu ler o QR code? Copie esta URL no app autenticador:{' '}
          <code style={{ wordBreak: 'break-all' }}>{otpAuthUrl}</code>
        </p>
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
            {submitting ? 'Ativando…' : 'Ativar'}
          </button>
        </form>
        <p className="note">Após ativar, o próximo login pedirá o código do app autenticador.</p>
        <a href="/" className="back-link">
          ← Voltar à página inicial
        </a>
      </div>
    </div>
  );
}
