'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatCents, type ApiCategory } from '@meufinanceiro/shared-types';
import { AppShell } from '@/components/app-shell';

export default function CategoriesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#246b61');
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
      const list = await api.getCategories();
      setCategories(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const created = await api.createCategory({
        name: name.trim(),
        color: color.trim() || '#246b61',
      });
      setCategories([created, ...categories]);
      setName('');
      setColor('#246b61');
      setToast({ kind: 'success', message: 'Categoria criada' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar categoria');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta categoria?')) return;
    try {
      await api.deleteCategory(id);
      setCategories(categories.filter((c) => c.id !== id));
      setToast({ kind: 'success', message: 'Categoria excluída' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir categoria');
    }
  };

  if (loading) {
    return (
      <AppShell title="Categorias">
        <div className="loading">Carregando categorias…</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Categorias">
      {error && <p className="error-msg">{error}</p>}
      {toast && <div className="toast" role="status">{toast.message}</div>}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Cadastros</p>
          <h1>Categorias</h1>
          <p className="page-description">
            Classifique suas movimentações e use as categorias nos orçamentos.
          </p>
        </div>
      </div>
      <section className="panel list-panel">
        <ul className="category-list">
          {categories.length === 0 && (
            <p className="list-count">Nenhuma categoria cadastrada.</p>
          )}
          {categories.map((category) => (
            <li key={category.id} className="category-item">
              <div className="category-heading">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="category-mark"
                    aria-hidden="true"
                    style={{
                      backgroundColor: category.color,
                      color: '#ffffff',
                    }}
                  >
                    {category.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{category.name}</span>
                </div>
                {category.isSystem && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '999px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'var(--color-muted)',
                    }}
                  >
                    Sistema
                  </span>
                )}
              </div>
              {!category.isSystem && (
                <button
                  className="text-button"
                  onClick={() => handleDelete(category.id)}
                  type="button"
                >
                  Excluir
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <form onSubmit={handleCreate} className="create-account-form">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da categoria"
          required
        />
        <input
          className="input"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="Cor (ex: #246b61)"
          required
        />
        <button type="submit" className="button button-primary">
          Criar categoria
        </button>
      </form>
    </AppShell>
  );
}
