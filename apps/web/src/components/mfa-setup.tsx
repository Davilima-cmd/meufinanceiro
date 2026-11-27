'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

/**
 * Ativação e desativação do segundo fator (TOTP).
 *
 * O segredo **nasce no servidor**: `mfaNewSecret` grava um segredo pendente
 * (cifrado) no usuário, `mfaQrCode` desenha esse segredo e `mfaEnable` confere
 * o primeiro código contra ele. A tela nunca manda segredo — só o código de 6
 * dígitos, que é o que a API valida.
 *
 * Desligar o MFA também exige código: é a primeira coisa que alguém com a
 * sessão sequestrada tentaria, então a API recusa sem o autenticador na mão.
 */
export function MfaSetup({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: (enabled: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function resetCode() {
    setCode('');
    setError('');
  }

  /** Pede um segredo novo ao servidor e mostra o QR do segredo pendente. */
  async function startEnrollment() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const generated = await api.mfaNewSecret();
      setSecret(generated.secret);
      // O QR vem do segredo pendente que o servidor guardou — não deste texto.
      const qr = await api.mfaQrCode();
      setQrCode(qr.qrCode ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o segredo.');
    } finally {
      setBusy(false);
    }
  }

  function cancelEnrollment() {
    setSecret(null);
    setQrCode(null);
    resetCode();
  }

  async function confirmEnrollment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.mfaEnable({ token: code });
      onChanged(true);
      setSecret(null);
      setQrCode(null);
      setCode('');
      setNotice('Segundo fator ativado. Guarde o app autenticador: sem ele não há como entrar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.mfaDisable({ token: code });
      onChanged(false);
      setCode('');
      setNotice('Segundo fator desativado. A conta volta a depender só da senha.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>Autenticação de dois fatores</strong>
        <small>
          {enabled
            ? 'Ativa nesta conta: além da senha, é pedido o código de 6 dígitos do app autenticador.'
            : 'Desativada. Ativar protege o acesso mesmo se a senha vazar.'}
        </small>
        {notice ? <small role="status">{notice}</small> : null}
        {error ? <small className="form-error">{error}</small> : null}

        {!enabled && secret ? (
          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
            <p className="field-hint">
              Leia o QR code no app autenticador (Google Authenticator, 1Password, Authy). Se não
              conseguir ler, digite o código abaixo dele.
            </p>
            {qrCode ? (
              // Data URL gerada pelo servidor a partir do segredo pendente.
              <img
                alt="QR code do segredo para o app autenticador"
                className="mfa-qr"
                height={168}
                src={qrCode}
                width={168}
              />
            ) : null}
            <code className="mfa-secret" aria-label="Segredo para digitar no app">
              {secret}
            </code>
            <form className="form-row" onSubmit={confirmEnrollment}>
              <label className="field">
                <span>Código de 6 dígitos do app</span>
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
              <button
                className="button button-primary"
                disabled={busy || code.length !== 6}
                type="submit"
              >
                {busy ? 'Confirmando…' : 'Confirmar e ativar'}
              </button>
              <button className="button button-ghost" onClick={cancelEnrollment} type="button">
                Cancelar
              </button>
            </form>
          </div>
        ) : null}

        {!enabled && !secret ? (
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => void startEnrollment()}
            style={{ marginTop: 12 }}
            type="button"
          >
            {busy ? 'Gerando segredo…' : 'Ativar segundo fator'}
          </button>
        ) : null}

        {enabled ? (
          <form className="form-row" onSubmit={disable} style={{ marginTop: 12 }}>
            <label className="field">
              <span>Código atual do app, para desativar</span>
              <input
                autoComplete="one-time-code"
                className="input input-amount"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => {
                  resetCode();
                  setCode(event.target.value.replace(/\D/g, ''));
                }}
                placeholder="000000"
                value={code}
              />
            </label>
            <button
              className="button button-danger"
              disabled={busy || code.length !== 6}
              type="submit"
            >
              {busy ? 'Desativando…' : 'Desativar segundo fator'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
