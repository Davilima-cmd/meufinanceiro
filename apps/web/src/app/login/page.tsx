'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFinance } from '@/lib/store';
import { withTimeout } from '@/lib/api';
import { BrandLogo } from '@/components/brand';
import type { AuthResponse } from '@meufinanceiro/shared-types';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function LoginPage() {
  const { session, hydrated, startDemo, snapshot, toggleTheme } = useFinance();
  const theme = snapshot.settings.theme;
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

  // O login não usa o shell, então o tema precisa ser escrito aqui também —
  // é o que faz a tela trocar entre a arte escura e a clara.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

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
      {/* Fundo do manual: grafite com duas formas do "c" ampliadas, uma em
          degradê laranja→coral→roxo em cada canto, e o fio curvo da marca. O
          tema claro troca o grafite pelo off white e suaviza as formas. */}
      <div aria-hidden="true" className="auth-bg">
        <span className="auth-shape auth-shape-a" />
        <span className="auth-shape auth-shape-b" />
        <span className="auth-shape auth-shape-c" />
        <span className="auth-hairline" />
      </div>

      <button
        aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        className="auth-theme icon-button"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        type="button"
      >
        {theme === 'dark' ? '☼' : '☾'}
      </button>

      <div className="auth-form-wrap">
        <BrandLogo />
        <div className="auth-card">
          <div>
            <h1>
              Entrar no <span className="auth-title-accent">painel</span>
            </h1>
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
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path
                  d="M4 19V9m5 10V5m5 14v-6m5 6V8"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
              Demonstração
            </button>
            <button
              aria-selected={tab === 'conta'}
              className={tab === 'conta' ? 'is-active' : ''}
              onClick={() => setTab('conta')}
              role="tab"
              type="button"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path
                  d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
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
                <label className="field auth-field">
                  <span>
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                      <path
                        d="M4 6h16v12H4V6Zm0 1 8 6 8-6"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                      />
                    </svg>
                    E-mail
                  </span>
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
                <label className="field auth-field">
                  <span>
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                      <path
                        d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5v-9Z"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                      />
                    </svg>
                    {mode === 'reset' ? 'Nova senha' : 'Senha'}
                  </span>
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
                <svg aria-hidden="true" className="button-arrow" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M5 12h13m0 0-5-5m5 5-5 5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
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

          <p className="auth-note auth-note-api">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 11v5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              <circle cx="12" cy="7.8" fill="currentColor" r="1" />
            </svg>
            <span>
              A API é servida separadamente (<code>NEXT_PUBLIC_API_BASE</code>). Se ela não estiver
              disponível, use o modo demonstração.
            </span>
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
