import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from './page';

/**
 * Fluxo de recuperação de senha (item 26.2): pedido pelo e-mail e definição da
 * nova senha a partir do código recebido.
 */

const { apiMock, pushMock } = vi.hoisted(() => ({
  apiMock: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    setToken: vi.fn(),
  },
  pushMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: apiMock,
  withTimeout: (promise: Promise<unknown>) => promise,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock('@/lib/store', () => ({
  useFinance: () => ({ session: null, hydrated: true, startDemo: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.forgotPassword.mockResolvedValue({ requested: true });
  apiMock.resetPassword.mockResolvedValue({ reset: true });
});

async function openAccountTab() {
  render(<LoginPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Tenho uma conta' }));
  await screen.findByRole('button', { name: 'Entrar' });
}

describe('Login — recuperação de senha', () => {
  it('oferece o link "Esqueci minha senha" na aba de conta', async () => {
    await openAccountTab();
    expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeTruthy();
  });

  it('pede o link, esconde a senha e avisa sem confirmar se o e-mail existe', async () => {
    await openAccountTab();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'davi@ex.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de redefinição' }));

    await waitFor(() => expect(apiMock.forgotPassword).toHaveBeenCalledWith('davi@ex.com'));
    expect(await screen.findByText(/se este e-mail existir/i)).toBeTruthy();
    // Na etapa de pedido não existe campo de senha.
    expect(screen.queryByLabelText('Senha')).toBeNull();
  });

  it('envia código e nova senha para a API e volta ao login', async () => {
    await openAccountTab();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'davi@ex.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de redefinição' }));
    await screen.findByLabelText(/código recebido/i);

    const codigo = 'a'.repeat(64);
    fireEvent.change(screen.getByLabelText(/código recebido/i), { target: { value: codigo } });
    fireEvent.change(screen.getByLabelText(/nova senha/i), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));

    await waitFor(() =>
      expect(apiMock.resetPassword).toHaveBeenCalledWith(codigo, 'senha-forte-1')
    );
    expect(await screen.findByText(/senha redefinida/i)).toBeTruthy();
  });

  it('mostra a mensagem da API quando o código é inválido', async () => {
    apiMock.resetPassword.mockRejectedValue(new Error('Token inválido ou expirado.'));
    await openAccountTab();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'davi@ex.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de redefinição' }));
    await screen.findByLabelText(/código recebido/i);

    fireEvent.change(screen.getByLabelText(/código recebido/i), {
      target: { value: 'b'.repeat(64) },
    });
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'senha-forte-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));

    expect(await screen.findByText(/token inválido ou expirado/i)).toBeTruthy();
  });
});

describe('Entrada — layout centrado', () => {
  it('mostra só o painel no meio, com o fundo animado decorativo', () => {
    const { container } = render(<LoginPage />);

    // A vitrine de duas colunas saiu; sobrou o cartão.
    expect(container.querySelector('.auth-showcase')).toBeNull();
    expect(container.querySelector('.auth-card')).toBeTruthy();

    // O fundo é decorativo: nada dentro dele deve ser lido ou focável.
    const bg = container.querySelector('.auth-bg');
    expect(bg?.getAttribute('aria-hidden')).toBe('true');
    expect(bg?.querySelectorAll('button, input, a').length).toBe(0);
  });
});
