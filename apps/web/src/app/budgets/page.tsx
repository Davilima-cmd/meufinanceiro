'use client'; /* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatCents, type ApiBudget, type ApiCategory } from '@meufinanceiro/shared-types';
import { AppShell } from '@/components/app-shell';

export default function BudgetsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [amountCents, setAmountCents] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
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
      const [budgetsList, categoriesList] = await Promise.all([
        api.getBudgets(),
        api.getCategories(),
      ]);
      setBudgets(budgetsList);
      setCategories(categoriesList.filter((c) => !c.isSystem));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar orçamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const fmtDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !amountCents.trim() || !periodStart || !periodEnd) return;
    setError(null);
    try {
      await api.createBudget({
        categoryId,
        amountCents: amountCents.trim(),
        periodStart,
        periodEnd,
      });
      setCategoryId('');
      setAmountCents('');
      setPeriodStart(firstDay);
      setPeriodEnd(lastDay);
      await load();
      setToast({ kind: 'success', message: 'Orçamento criado' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar orçamento');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este orçamento?')) return;
    try {
      await api.deleteBudget(id);
      setBudgets(budgets.filter((b) => b.id !== id));
      setToast({ kind: 'success', message: 'Orçamento excluído' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir orçamento');
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
      <AppShell title="Orçamentos">
        <div className="loading">Carregando orçamentos…</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Orçamentos">
      {error && <p className="error-msg">{error}</p>}
      {toast && (
        <div className="toast" role="status">
          {toast.message}
        </div>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Planejamento</p>
          <h1>Orçamentos</h1>
          <p className="page-description">
            Defina um limite de gasto por categoria e acompanhe o que já foi consumido no período.
          </p>
        </div>
      </div>
      <section className="panel list-panel">
        <ul className="account-list">
          {budgets.length === 0 && <p className="list-count">Nenhum orçamento cadastrado.</p>}
          {budgets.map((budget) => (
            <li key={budget.id} className="account-row">
              <span
                className="account-mark"
                aria-hidden="true"
                style={{
                  backgroundColor: budget.category.color,
                  color: '#ffffff',
                }}
              >
                {budget.category.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="account-copy">
                <span className="account-name">{budget.category.name}</span>
                <span className="account-detail">
                  Período: {fmtDate(budget.periodStart)} a {fmtDate(budget.periodEnd)}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="account-balance">
                  {formatCents(BigInt(budget.amountCents ?? '0'))}
                </strong>
                <p style={{ margin: 0, fontSize: '10px', color: 'var(--color-muted)' }}>
                  Gasto {formatCents(BigInt(budget.spentCents ?? '0'))} · restante{' '}
                  {formatCents(BigInt(budget.remainingCents ?? '0'))}
                </p>
              </div>
              <button className="text-button" onClick={() => handleDelete(budget.id)} type="button">
                Excluir
              </button>
            </li>
          ))}
        </ul>
      </section>
      <form onSubmit={handleCreate} className="create-account-form">
        <select
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          value={amountCents}
          onChange={(e) => setAmountCents(e.target.value)}
          placeholder="Limite (centavos, ex: 30000)"
          required
        />
        <input
          className="input"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          required
        />
        <input
          className="input"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          required
        />
        <button type="submit" className="button button-primary">
          Criar orçamento
        </button>
      </form>
      <p className="inline-note">
        O gasto considerado é o total de despesas da categoria no período do orçamento.
      </p>
    </AppShell>
  );
}
