'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useFinance } from '@/lib/store';
import { initialOf } from '@/lib/format';

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

function Icon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: '/', label: 'Visão geral', icon: <Icon path="M3 12h5l2.5 6 4-14 2.5 8h4" /> },
  {
    href: '/lancamentos',
    label: 'Lançamentos',
    icon: <Icon path="M4 7h16M4 12h10M4 17h13" />,
  },
  {
    href: '/vencimentos',
    label: 'Vencimentos',
    icon: (
      <Icon path="M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 8h2m4 0h2m-8 4h2" />
    ),
  },
  {
    href: '/contas',
    label: 'Contas',
    icon: (
      <Icon path="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm0 3h16" />
    ),
  },
  {
    href: '/orcamentos',
    label: 'Orçamentos',
    icon: <Icon path="M12 3v18M5 8h9a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h10" />,
  },
  {
    href: '/patrimonio',
    label: 'Patrimônio',
    icon: <Icon path="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" />,
  },
  {
    href: '/metas',
    label: 'Metas',
    icon: <Icon path="M6 21V4m0 0h11l-2.5 4L17 12H6" />,
  },
  {
    href: '/categorias',
    label: 'Categorias',
    icon: <Icon path="M4 5h7v7H4V5Zm9 0h7v7h-7V5ZM4 14h7v5H4v-5Zm9 0h7v5h-7v-5Z" />,
  },
  {
    href: '/casal',
    label: 'Casal',
    icon: (
      <Icon path="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 9v-1a4 4 0 0 0-3-3.9M15.5 10a3.5 3.5 0 1 0 0-7" />
    ),
  },
  {
    href: '/configuracoes',
    label: 'Configurações',
    icon: (
      <Icon path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.1l2-1.5-2-3.4-2.3.9a7.4 7.4 0 0 0-1.9-1.1L14.7 3H9.3l-.4 2.4a7.4 7.4 0 0 0-1.9 1.1L4.7 5.6l-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-.9a7.4 7.4 0 0 0 1.9 1.1l.4 2.4h5.4l.4-2.4a7.4 7.4 0 0 0 1.9-1.1l2.3.9 2-3.4-2-1.5c.06-.36.1-.73.1-1.1Z" />
    ),
  },
];

const MOBILE_NAV = NAV.slice(0, 5);

export function AppShell({ children }: { children: ReactNode }) {
  const { snapshot, session, signOut, setHideValues, toggleTheme, hydrated, resetDemo } =
    useFinance();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !session) {
      router.replace('/login');
    }
  }, [hydrated, session, router]);

  const theme = snapshot.settings.theme;

  if (!hydrated) {
    return (
      <div className="boot" aria-busy="true">
        <span className="boot-mark">mf</span>
        <span>Carregando seu painel…</span>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const user = session.user;

  return (
    <div className="shell" data-theme={theme}>
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
          <span aria-hidden="true" className="brand-mark">
            mf
          </span>
          <span className="brand-text">
            meu financeiro
            <small>finanças a dois</small>
          </span>
        </Link>

        <nav aria-label="Navegação principal" className="nav">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                aria-current={active ? 'page' : undefined}
                className={`nav-item ${active ? 'is-active' : ''}`}
                href={item.href}
                key={item.href}
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {session.mode === 'demo' ? (
            <div className="demo-chip">
              <span className="dot" aria-hidden="true" />
              Modo demonstração
            </div>
          ) : (
            <div className="demo-chip is-live">
              <span className="dot" aria-hidden="true" />
              Conectado à API
            </div>
          )}
          <div className="user-box">
            <span aria-hidden="true" className="avatar">
              {initialOf(user.name)}
            </span>
            <span className="user-copy">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <button
              className="icon-button"
              onClick={() => void signOut()}
              title="Sair"
              type="button"
              aria-label="Sair"
            >
              <Icon path="M15 18l-6-6 6-6M9 12h12" />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            aria-label="Abrir menu"
            className="icon-button menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <Icon path="M4 7h16M4 12h16M4 17h16" />
          </button>
          <div className="topbar-title">
            {NAV.find((item) => item.href === pathname)?.label ?? 'Painel'}
          </div>
          <div className="topbar-actions">
            <span className="topbar-hint">
              {snapshot.settings.partnerName} também usa este painel
            </span>
            <button
              aria-label={snapshot.settings.hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              className="icon-button"
              onClick={() => setHideValues(!snapshot.settings.hideValues)}
              title={snapshot.settings.hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              type="button"
            >
              {snapshot.settings.hideValues ? (
                <Icon path="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.7 9.7 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.3 6.9C3.9 8.4 3 10.4 3 12c0 2.5 4 7 9 7 1.3 0 2.5-.3 3.6-.8" />
              ) : (
                <Icon path="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              )}
            </button>
            <button
              aria-label="Alternar tema"
              className="icon-button"
              onClick={toggleTheme}
              title="Alternar tema"
              type="button"
            >
              {theme === 'dark' ? (
                <Icon path="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
              ) : (
                <Icon path="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
              )}
            </button>
          </div>
        </header>

        <main className="content">{children}</main>

        {session.mode === 'demo' ? (
          <div className="demo-banner">
            <span>
              Você está no modo demonstração, com dados fictícios do casal salvos neste navegador.
            </span>
            <button className="link-button" onClick={resetDemo} type="button">
              Restaurar dados de exemplo
            </button>
          </div>
        ) : null}
      </div>

      <nav aria-label="Navegação rápida" className="mobile-nav">
        {MOBILE_NAV.map((item) => (
          <Link
            aria-current={pathname === item.href ? 'page' : undefined}
            className={`mobile-nav-item ${pathname === item.href ? 'is-active' : ''}`}
            href={item.href}
            key={item.href}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
