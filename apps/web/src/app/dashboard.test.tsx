import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinanceProvider, useFinance } from '@/lib/store';
import DashboardPage from '@/app/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

beforeEach(() => {
  window.localStorage.clear();
});

function LoginOnMount() {
  const { startDemo, hydrated, session } = useFinance();
  useEffect(() => {
    if (hydrated && !session) startDemo();
  }, [hydrated, session, startDemo]);
  return null;
}

function renderDashboard() {
  return render(
    <FinanceProvider>
      <LoginOnMount />
      <DashboardPage />
    </FinanceProvider>
  );
}

describe('Visão geral', () => {
  it('mostra saudação, saldo consolidado e seções principais', async () => {
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Davi')
    );
    expect(screen.getByText('Saldo consolidado (contas visíveis)')).toBeTruthy();
    expect(screen.getByText('Entradas e saídas')).toBeTruthy();
    expect(screen.getByText('Onde o dinheiro foi')).toBeTruthy();
    expect(screen.getByText('Lançamentos recentes')).toBeTruthy();
  });

  it('abre o diálogo e registra um lançamento na lista', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: '+ Novo lançamento' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();

    await user.type(screen.getByLabelText('Valor'), '42,90');
    await user.type(screen.getByLabelText('Descrição'), 'Pizza do sábado');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Pizza do sábado')).toBeTruthy();
  });

  it('rejeita lançamento sem valor', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: '+ Novo lançamento' }));
    await user.type(screen.getByLabelText('Descrição'), 'Sem valor');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    expect(await screen.findByText('Informe um valor maior que zero.')).toBeTruthy();
  });

  it('navega para o mês anterior', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const titulo = screen.getAllByRole('button', { name: /de \d{4}/ })[0];
    const textoInicial = titulo.textContent;
    await user.click(screen.getAllByRole('button', { name: 'Mês anterior' })[0]);
    await waitFor(() => expect(titulo.textContent).not.toBe(textoInicial));
  });
});
