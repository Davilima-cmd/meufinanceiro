'use client';

import { useAuth } from '@/contexts/auth-context';
import { usePathname, useRouter } from 'next/navigation';

type NavItem = {
  id: string;
  label: string;
  href: string;
};

const navigation: NavItem[] = [
  { id: 'home', label: 'Visão geral', href: '/' },
  { id: 'transactions', label: 'Movimentações', href: '/' },
  { id: 'accounts', label: 'Contas', href: '/' },
  { id: 'analysis', label: 'Análises', href: '/' },
  { id: 'profile', label: 'Perfil', href: '/' },
  { id: 'categories', label: 'Categorias', href: '/categories' },
  { id: 'budgets', label: 'Orçamentos', href: '/budgets' },
  { id: 'goals', label: 'Metas', href: '/goals' },
];

interface AppShellProps {
  title: string;
  children: React.ReactNode;
}

export function AppShell({ title, children }: AppShellProps) {
  const { user, hideValues, setHideValues, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  function isActive(item: NavItem) {
    if (item.href === '/') {
      return pathname === '/';
    }
    return pathname === item.href;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span aria-hidden="true" className="brand-mark">
            mf
          </span>
          <span>meu financeiro</span>
        </div>
        <nav aria-label="Navegação principal" className="sidebar-nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${isActive(item) ? 'is-active' : ''}`}
              onClick={() => router.push(item.href)}
              type="button"
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="user-avatar" aria-hidden="true">
            {user?.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="user-copy">
            <strong>{user?.name ?? ''}</strong>
            <span>{user?.email ?? ''}</span>
          </span>
          <button className="nav-item logout" onClick={logout} type="button">
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">{title}</span>
          <div className="topbar-actions">
            <span className="demo-indicator">
              <span />
              Conectado à API
            </span>
            <button
              aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              className="icon-button"
              onClick={() => setHideValues(!hideValues)}
              type="button"
            >
              {hideValues ? 'Mostrar' : 'Ocultar'}
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
