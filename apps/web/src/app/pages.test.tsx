import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogProvider } from '@/components/dialog';
import { FinanceProvider, useFinance } from '@/lib/store';
import BudgetsPage from '@/app/orcamentos/page';
import SettingsPage from '@/app/configuracoes/page';
import CategoriesPage from '@/app/categorias/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/orcamentos',
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

function renderPage(page: React.ReactElement) {
  return render(
    <FinanceProvider>
      <DialogProvider>
        <LoginOnMount />
        {page}
      </DialogProvider>
    </FinanceProvider>
  );
}

describe('Orçamentos', () => {
  it('define um limite usando o select e a confirmação próprios', async () => {
    const user = userEvent.setup();
    const { container } = renderPage(<BudgetsPage />);

    const heading = await screen.findByRole('heading', { name: 'Definir limite' });
    const form = heading.closest('section') as HTMLElement;
    expect(form).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();

    // Escolhe a categoria no select próprio
    await user.click(within(form).getByRole('button', { name: 'Categoria do orçamento' }));
    const category = await screen.findByRole('option', { name: /Moradia/ });
    await user.click(category);

    await user.type(within(form).getByLabelText('Limite mensal'), '1250,00');
    expect(within(form).getByText('R$ 1.250,00')).toBeTruthy();

    await user.click(within(form).getByRole('button', { name: 'Salvar limite' }));

    const notice = await screen.findByRole('alertdialog');
    expect(notice.textContent).toContain('Limite salvo');
    expect(notice.textContent).toContain('R$ 1.250,00');
    await user.click(within(notice).getByRole('button', { name: 'Entendi' }));

    await waitFor(() =>
      expect(within(form).getByLabelText('Limite mensal')).toHaveProperty('value', '')
    );
    expect(await screen.findByText('R$ 1.250,00')).toBeTruthy();
  });

  it('pede confirmação própria antes de excluir um limite', async () => {
    const user = userEvent.setup();
    renderPage(<BudgetsPage />);

    const deleteButtons = await screen.findAllByRole('button', { name: /Excluir orçamento de/ });
    await user.click(deleteButtons[0]);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Excluir o limite de');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByText('Nenhum orçamento neste mês')).toBeNull();
  });
});

describe('Categorias', () => {
  it('cria categoria com tipo escolhido no select próprio', async () => {
    const user = userEvent.setup();
    const { container } = renderPage(<CategoriesPage />);

    await screen.findByRole('heading', { name: 'Nova categoria' });
    expect(container.querySelector('select')).toBeNull();

    await user.type(screen.getByPlaceholderText('Assinaturas'), 'Assinaturas');
    await user.click(screen.getByRole('button', { name: 'Tipo da categoria' }));
    await user.click(await screen.findByRole('option', { name: 'Receita' }));
    await user.click(screen.getByRole('button', { name: 'Criar categoria' }));

    expect(await screen.findByText('Assinaturas')).toBeTruthy();
  });

  it('confirma a exclusão de categoria em diálogo próprio', async () => {
    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    await user.type(await screen.findByPlaceholderText('Assinaturas'), 'Assinaturas do Davi');
    await user.click(screen.getByRole('button', { name: 'Criar categoria' }));
    await screen.findByRole('cell', { name: 'Assinaturas do Davi' });

    await user.click(screen.getByRole('button', { name: 'Excluir Assinaturas do Davi' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Excluir “Assinaturas do Davi”?');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir categoria' }));

    await waitFor(() =>
      expect(screen.queryByRole('cell', { name: 'Assinaturas do Davi' })).toBeNull()
    );
  });
});

describe('Configurações', () => {
  it('no modo demonstração não oferece ativar o segundo fator', async () => {
    renderPage(<SettingsPage />);

    // Sem login não existe conta para proteger: a tela diz isso em vez de
    // mostrar um botão que a API recusaria (modo demo não tem sessão).
    expect(await screen.findByText(/Disponível apenas em contas reais/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ativar segundo fator' })).toBeNull();
  });
});
