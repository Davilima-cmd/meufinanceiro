'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { FinanceApp } from '@/components/finance-app-api';

export default function HomePage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isLoading && !user && pathname !== '/login') {
      router.replace('/login');
    }
  }, [user, isLoading, pathname, router]);

  if (!mounted || (isLoading && !user)) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span aria-hidden="true" className="brand-mark">mf</span>
          <span>meu financeiro</span>
        </div>
        <nav aria-label="Navegação principal" className="sidebar-nav">
          <button className="nav-item" onClick={() => router.push('/')}>
            <span>Visão geral</span>
          </button>
          <button className="nav-item" onClick={() => router.push('/transactions')}>
            <span>Movimentações</span>
          </button>
          <button className="nav-item" onClick={() => router.push('/accounts')}>
            <span>Contas</span>
          </button>
          <button className="nav-item" onClick={() => router.push('/analysis')}>
            <span>Análises</span>
          </button>
          <button className="nav-item" onClick={() => router.push('/profile')}>
            <span>Perfil</span>
          </button>
        </nav>
        <button className="nav-item logout" onClick={logout}>
          <span>Sair</span>
        </button>
      </aside>
      <div className="main-area">
        <FinanceApp user={user} />
      </div>
    </div>
  );
}
