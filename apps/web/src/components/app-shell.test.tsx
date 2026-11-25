import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinanceProvider, useFinance } from '@/lib/store';
import { AppShell } from '@/components/app-shell';
import { Money } from '@/components/ui';

const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace, push }),
}));

beforeEach(() => {
  window.localStorage.clear();
  replace.mockClear();
  push.mockClear();
});

function LoginOnMount() {
  const { startDemo, hydrated, session } = useFinance();
  useEffect(() => {
    if (hydrated && !session) startDemo();
  }, [hydrated, session, startDemo]);
  return null;
}

describe('AppShell', () => {
  it('redireciona para o login quando não há sessão', async () => {
    render(
      <FinanceProvider>
        <AppShell>
          <p>conteúdo</p>
        </AppShell>
      </FinanceProvider>
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('mostra navegação e permite ocultar valores', async () => {
    const user = userEvent.setup();
    render(
      <FinanceProvider>
        <LoginOnMount />
        <AppShell>
          <Money value={123456n} />
        </AppShell>
      </FinanceProvider>
    );

    await waitFor(() => expect(screen.getByText('R$ 1.234,56')).toBeTruthy());
    expect(screen.getAllByText('Lançamentos').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Ocultar valores' }));
    await waitFor(() => expect(screen.queryByText('R$ 1.234,56')).toBeNull());
  });
});
