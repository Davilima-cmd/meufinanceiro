import { test, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => '/'),
}));

import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { AuthProvider } from '@/contexts/auth-context';
import LoginPage from './page';

const mockApiLogin = vi.mocked(api.login);
const mockApiRegister = vi.mocked(api.register);
const mockUseRouter = vi.mocked(useRouter);

function lastRouter() {
  const push = vi.fn();
  const replace = vi.fn();
  for (const result of mockUseRouter.mock.results) {
    const router = result.value as { push: Mock; replace: Mock } | undefined;
    router?.push.mock.calls.forEach((args) => push(...args));
    router?.replace.mock.calls.forEach((args) => replace(...args));
  }
  return { push, replace };
}

const user = {
  id: 'u-1',
  email: 'ana@email.com',
  name: 'Ana',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApiLogin.mockResolvedValue({ token: 'tok-1', user });
  mockApiRegister.mockResolvedValue(user);
});

test('login chama a API com as credenciais e redireciona para o dashboard', async () => {
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );

  fireEvent.change(screen.getByLabelText(/e-mail/i), {
    target: { value: 'ana@email.com' },
  });
  fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'senha123' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

  await waitFor(() =>
    expect(mockApiLogin).toHaveBeenCalledWith({ email: 'ana@email.com', password: 'senha123' })
  );
  const { push, replace } = lastRouter();
  await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  expect(replace).not.toHaveBeenCalled();
});

test('exibe mensagem de erro quando o login falha e não redireciona', async () => {
  mockApiLogin.mockRejectedValue(new Error('Senha inválida.'));

  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );

  fireEvent.change(screen.getByLabelText(/e-mail/i), {
    target: { value: 'ana@email.com' },
  });
  fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'senha123' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

  await waitFor(() => screen.getByText('Senha inválida.'));
  const { push } = lastRouter();
  expect(push).not.toHaveBeenCalled();
});

test('cadastro chama o registro e depois o login automático', async () => {
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );

  fireEvent.change(screen.getByLabelText(/e-mail/i), {
    target: { value: 'nova@email.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: /cadastre-se/i }));
  fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Ana Nova' } });
  fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'senha123' } });
  fireEvent.click(screen.getByRole('button', { name: /criar conta/i }));

  await waitFor(() =>
    expect(mockApiRegister).toHaveBeenCalledWith({
      email: 'nova@email.com',
      name: 'Ana Nova',
      password: 'senha123',
    })
  );
  await waitFor(() =>
    expect(mockApiLogin).toHaveBeenCalledWith({ email: 'nova@email.com', password: 'senha123' })
  );
  const { push } = lastRouter();
  await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
});
