'use client'; /* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatCents, type ApiGoal } from '@meufinanceiro/shared-types';
import { AppShell } from '@/components/app-shell';

export default function GoalsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [goals, setGoals] = useState<ApiGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [targetCents, setTargetCents] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Hooks sempre executados (ordem fixa)
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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await api.getGoals();
      setGoals(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar metas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const progressPercent = (goal: ApiGoal) => Math.round((goal.progress ?? 0) * 100);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetCents.trim()) return;
    setError(null);
    try {
      const created = await api.createGoal({
        name: name.trim(),
        targetCents: targetCents.trim(),
        dueDate: dueDate || undefined,
      });
      setGoals([created, ...goals]);
      setName('');
      setTargetCents('');
      setDueDate('');
      setToast({ kind: 'success', message: 'Meta criada' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar meta');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta meta?')) return;
    try {
      await api.deleteGoal(id);
      setGoals(goals.filter((g) => g.id !== id));
      setToast({ kind: 'success', message: 'Meta excluída' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir meta');
    }
  };

  if (!mounted || (isLoading && !user)) {
    return null;
  }
  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <AppShell title="Metas">
        <div className="loading">Carregando metas…</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Metas">
      {error && <p className="error-msg">{error}</p>}
      {toast && (
        <div className="toast" role="status">
          {toast.message}
        </div>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Objetivos</p>
          <h1>Metas financeiras</h1>
          <p className="page-description">Defina metas de economia e acompanhe seu progresso.</p>
        </div>
      </div>
      <section className="panel list-panel">
        <ul className="account-list">
          {goals.length === 0 && <p className="list-count">Nenhuma meta cadastrada.</p>}
          {goals.map((goal) => (
            <li key={goal.id} className="account-row">
              <span
                className="account-mark"
                aria-hidden="true"
                style={{
                  backgroundColor: '#246b61',
                  color: '#ffffff',
                }}
              >
                <span>⯁</span>
              </span>
              <div className="account-copy">
                <span className="account-name">{goal.name}</span>
                <span className="account-detail">
                  {goal.dueDate
                    ? 'Até ' + new Date(goal.dueDate).toLocaleDateString('pt-BR')
                    : 'Sem prazo'}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="account-balance">
                  {formatCents(BigInt(goal.currentCents ?? '0'))}
                </strong>
                <p style={{ margin: 0, fontSize: '10px', color: 'var(--color-muted)' }}>
                  Progresso {progressPercent(goal)}%
                </p>
              </div>
              <button className="text-button" onClick={() => handleDelete(goal.id)} type="button">
                Excluir
              </button>
            </li>
          ))}
        </ul>
      </section>
      <form onSubmit={handleCreate} className="create-account-form">
        <input
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da meta"
          required
        />
        <input
          className="input"
          type="number"
          value={targetCents}
          onChange={(e) => setTargetCents(e.target.value)}
          placeholder="Valor alvo (centavos, ex: 500000)"
          required
        />
        <input
          className="input"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <button type="submit" className="button button-primary">
          Criar meta
        </button>
      </form>
      <p className="inline-note">O progresso é calculado com base no valor atual salvo na meta.</p>
    </AppShell>
  );
}
