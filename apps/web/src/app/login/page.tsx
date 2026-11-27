'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFinance } from '@/lib/store';
import { withTimeout } from '@/lib/api';
import { BrandLockup, BrandMark } from '@/components/brand';
import type { AuthResponse } from '@meufinanceiro/shared-types';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function LoginPage() {
  const { session, hydrated, startDemo } = useFinance();
  const router = useRouter();
  const [tab, setTab] = useState<'demo' | 'conta'>('demo');
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && session) {
      router.replace('/');
    }
  }, [hydrated, session, router]);

  function enterDemo() {
    startDemo();
    router.push('/');
  }

  async function handleForgot() {
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const { api } = await import('@/lib/api');
      await withTimeout(api.forgotPassword(email), 8000);
      // A resposta é sempre a mesma, com ou sem conta cadastrada.
      setMode('reset');
      setNotice('Se este e-mail existir, enviamos um link de redefinição válido por 30 minutos.');
    } catch (err) {
      setError(formatAuthError(err instanceof Error ? err.message : 'Falha ao enviar o pedido.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const { api } = await import('@/lib/api');
      await withTimeout(api.resetPassword(token, password), 8000);
      setMode('login');
      setToken('');
      setPassword('');
      setNotice('Senha redefinida. Entre com a nova senha.');
    } catch (err) {
      setError(formatAuthError(err instanceof Error ? err.message : 'Falha ao redefinir a senha.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const { api } = await import('@/lib/api');
      if (mode === 'register') {
        await withTimeout(api.register({ email, name, password }), 8000);
        setMode('login');
        setNotice('Conta criada. Entre com a senha cadastrada.');
        setSubmitting(false);
        return;
      }
      const result: AuthResponse = await withTimeout(api.login({ email, password }), 8000);
      if (result.mfaRequired && result.tempToken) {
        sessionStorage.setItem('mf.mfa.temp', result.tempToken);
        sessionStorage.setItem('mf.mfa.email', email);
        router.push('/login/mfa');
        return;
      }
      if (!result.user) {
        throw new Error('Resposta de login inválida.');
      }
      // A sessão web vive no cookie `HttpOnly` que a API acabou de gravar: o
      // token não é guardado no `localStorage`, então um XSS não o alcança.
      // Guarda o estado do segundo fator junto com o usuário: a tela de
      // Configurações precisa dele antes de qualquer chamada nova.
      localStorage.setItem(
        'mf.session.api',
        JSON.stringify({
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            mfaEnabled: result.user.mfaEnabled,
          },
        })
      );
      router.push('/api');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível entrar agora.';
      setError(formatAuthError(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-showcase">
        <div className="brand">
          <BrandMark />
          <BrandLockup />
        </div>
        <div className="stack">
          <p className="eyebrow">Um painel para o casal</p>
          <h2>Tudo o que vocês gastam, juntam e planejam em um só lugar.</h2>
          <p>
            Contas compartilhadas com privacidade por padrão, orçamentos por categoria e metas
            acompanhadas mês a mês.
          </p>
          <ul className="auth-bullets">
            <li>
              <span className="tick" aria-hidden="true">
                ✓
              </span>
              Cada conta é privada até você compartilhar — só o saldo ou o histórico completo.
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                ✓
              </span>
              Orçamentos e metas com progresso calculado automaticamente.
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                ✓
              </span>
              Valores em centavos, sem erro de arredondamento, exibidos em reais.
            </li>
          </ul>
        </div>
        <p className="auth-note">
          Entre com uma conta real para conectar seus bancos — ou abra a demonstração e conheça o
          painel com dados fictícios, sem cadastro.
        </p>
      </aside>

      <div className="auth-form-wrap">
        <div className="auth-card">
          <div>
            <h1>Entrar no painel</h1>
            <p className="page-description">
              Explore com dados de exemplo ou conecte-se à sua conta na API.
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Forma de acesso">
            <button
              aria-selected={tab === 'demo'}
              className={tab === 'demo' ? 'is-active' : ''}
              onClick={() => setTab('demo')}
              role="tab"
              type="button"
            >
              Demonstração
            </button>
            <button
              aria-selected={tab === 'conta'}
              className={tab === 'conta' ? 'is-active' : ''}
              onClick={() => setTab('conta')}
              role="tab"
              type="button"
            >
              Tenho uma conta
            </button>
          </div>

          {tab === 'demo' ? (
            <div className="stack">
              <p className="page-description">
                Entra na hora, com o casal de exemplo: 5 contas, 6 meses de lançamentos, orçamentos
                e metas. Você pode lançar, editar e excluir à vontade — tudo fica salvo apenas neste
                navegador.
              </p>
              <button className="button button-primary" onClick={enterDemo} type="button">
                Entrar no modo demonstração
              </button>
              <p className="auth-note">
                Sem cadastro, sem banco de dados. Ideal para conhecer o produto.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {mode === 'register' ? (
                <label className="field">
                  <span>Nome</span>
                  <input
                    autoComplete="name"
                    className="input"
                    onChange={(event) => setName(event.target.value)}
                    required
                    type="text"
                    value={name}
                  />
                </label>
              ) : null}
              {mode !== 'reset' ? (
                <label className="field">
                  <span>E-mail</span>
                  <input
                    autoComplete="email"
                    className="input"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </label>
              ) : null}
              {mode === 'reset' ? (
                <label className="field">
                  <span>Código recebido por e-mail</span>
                  <input
                    autoComplete="one-time-code"
                    className="input"
                    minLength={32}
                    onChange={(event) => setToken(event.target.value.trim())}
                    required
                    type="text"
                    value={token}
                  />
                </label>
              ) : null}
              {mode !== 'forgot' ? (
                <label className="field">
                  <span>{mode === 'reset' ? 'Nova senha' : 'Senha'}</span>
                  <input
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="input"
                    minLength={8}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </label>
              ) : null}
              {error ? <p className="form-error">{error}</p> : null}
              {notice ? <p className="toast">{notice}</p> : null}
              <button
                className="button button-primary"
                disabled={submitting}
                onClick={(event) => {
                  if (mode === 'forgot') {
                    event.preventDefault();
                    void handleForgot();
                  } else if (mode === 'reset') {
                    event.preventDefault();
                    void handleReset();
                  }
                }}
                type="submit"
              >
                {submitting
                  ? 'Aguarde…'
                  : mode === 'login'
                    ? 'Entrar'
                    : mode === 'register'
                      ? 'Criar conta'
                      : mode === 'forgot'
                        ? 'Enviar link de redefinição'
                        : 'Definir nova senha'}
              </button>
              {mode === 'login' ? (
                <p className="auth-note">
                  <button
                    className="link-button"
                    onClick={() => {
                      setMode('forgot');
                      setError('');
                      setNotice('');
                    }}
                    type="button"
                  >
                    Esqueci minha senha
                  </button>
                </p>
              ) : null}
              {mode === 'forgot' || mode === 'reset' ? (
                <p className="auth-note">
                  <button
                    className="link-button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                      setNotice('');
                    }}
                    type="button"
                  >
                    Voltar para o login
                  </button>
                </p>
              ) : (
                <p className="auth-note">
                  {mode === 'login' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
                  <button
                    className="link-button"
                    onClick={() => {
                      setMode(mode === 'login' ? 'register' : 'login');
                      setError('');
                    }}
                    type="button"
                  >
                    {mode === 'login' ? 'Cadastre-se' : 'Faça login'}
                  </button>
                </p>
              )}
            </form>
          )}

          <p className="auth-note">
            A API é servida separadamente (<code>NEXT_PUBLIC_API_BASE</code>). Se ela não estiver
            disponível, use o modo demonstração.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatAuthError(message: string): string {
  if (/fetch|Failed|network|ERR_NETWORK/i.test(message)) {
    return 'API indisponível. Inicie o servidor da API ou use o modo demonstração.';
  }
  if (/timeout/i.test(message)) {
    return 'A API demorou para responder. Tente novamente ou use o modo demonstração.';
  }
  if (/401|credenciais/i.test(message)) {
    return 'E-mail ou senha inválidos.';
  }
  if (/409|já cadastrado|already/i.test(message)) {
    return 'Este e-mail já está cadastrado.';
  }
  return message;
}
