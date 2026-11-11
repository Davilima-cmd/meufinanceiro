'use client';

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
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );

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

  if (!mounted || (isLoading && !user)) {
    return null;
  }
  if (!user) {
    return null;
  }

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

  const progressPercent = (goal: ApiGoal) => Math.round(goal.progress * 100);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetCents.trim()) return;
    setError(null);
    try {
      await api.createGoal({
        name: name.trim(),
        targetCents: targetCents.trim(),
        dueDate: dueDate || undefined,
      });
      setName('');
      setTargetCents('');
      setDueDate('');
      await load();
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

  const fmtDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

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
      {toast && <div className="toast" role="status">{toast.message}</div>}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Planejamento</p>
          <h1>Metas financeiras</h1>
          <p className="page-description">
            Acompanhe o progresso de cada meta até a data limite.
          </p>
        </div>
      </div>
      <section className="panel list-panel">
        {goals.length === 0 && (
          <p className="list-count">Nenhuma meta cadastrada.</p>
        )}
        {goals.map((goal) => (
          <article key={goal.id} className="panel" style={{ marginTop: 12 }}>
            <div className="panel-heading">
              <div>
                <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                  {goal.name}
                </h2>
                <p>
                  {goal.dueDate ? `Vence em ${fmtDate(goal.dueDate)}` : 'Sem prazo definido'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div
                className="category-track"
                style={{ flex: 1, height: 10 }}
              >
                <span
                  style={{
                    width: `${Math.min(progressPercent(goal), 100)}%`,
                    background: 'var(--color-accent)',
                    borderRadius: 'inherit',
                    display: 'block',
                    height: '100%',
                  }}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                {progressPercent(goal)}% da meta
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                Acumulado {formatCents(BigInt(goal.currentCents))}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                Alvo {formatCents(BigInt(goal.targetCents))}
              </span>
            </div>
            <button
              className="text-button"
              onClick={() => handleDelete(goal.id)}
              type="button"
              style={{ marginTop: 10 }}
            >
              Excluir
            </button>
          </article>
        ))}
      </section>
      <form onSubmit={handleCreate} className="create-account-form">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da meta (ex: Viagem de férias)"
          required
        />
        <input
          className="input"
          type="number"
          value={targetCents}
          onChange={(e) => setTargetCents(e.target.value)}
          placeholder="Valor alvo (centavos, ex: 150000)"
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
    </AppShell>
  );
}
