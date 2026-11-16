'use client';

import { useState, type FormEvent } from 'react';
import { useAuth, apiErrorMessage } from '@/contexts/auth-context';
import Link from 'next/link';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, name, password);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="page-description">
          {mode === 'login'
            ? 'Acesse sua conta para continuar.'
            : 'Crie sua conta para começar a organizar suas finanças.'}
        </p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode === 'register' && (
            <label>
              Nome
              <input
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            Senha
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <p>
          {mode === 'login' ? 'Não tem uma conta? ' : 'Já tem uma conta? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="link-button"
          >
            {mode === 'login' ? 'Cadastre-se' : 'Faça login'}
          </button>
        </p>
        <p className="note">Dados de exemplo · protótipo local · não use dados bancários reais</p>
        <Link href="/" className="back-link">
          ← Voltar
        </Link>
      </div>
    </div>
  );
}
