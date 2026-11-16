'use client'; /* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { type ApiCategory } from '@meufinanceiro/shared-types';
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

  if (!mounted || (isLoading && !user)) {
    return null;
  }
  if (!user) {
    return null;
  }

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
      {toast && (
        <div className="toast" role="status">
          {toast.message}
        </div>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Organização</p>
          <h1>Categorias</h1>
          <p className="page-description">
            Gerencie suas categorias de despesas e receitas. As categorias do sistema não podem ser
            alteradas.
          </p>
        </div>
      </div>
      <section className="panel list-panel">
        <ul className="account-list">
          {categories.length === 0 && <p className="list-count">Nenhuma categoria cadastrada.</p>}
          {categories.map((category) => (
            <li key={category.id} className="account-row">
              <span
                className="account-mark"
                aria-hidden="true"
                style={{
                  backgroundColor: category.color,
                  color: '#ffffff',
                }}
              >
                {category.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="account-copy">
                <span className="account-name">{category.name}</span>
                <span className="account-detail">
                  {category.isSystem ? 'Sistema' : 'Personalizada'}
                </span>
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
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da categoria"
          required
        />
        <input
          className="input"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <button type="submit" className="button button-primary">
          Criar categoria
        </button>
      </form>
      <p className="inline-note">
        As categorias do sistema estão disponíveis para todos os usuários.
      </p>
    </AppShell>
  );
}
