import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  api: {
    getAccounts: vi.fn(),
    getTransactions: vi.fn(),
    getConnections: vi.fn(),
  },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
  apiErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { FinanceApp } from '@/components/finance-app-api';

const mockGetAccounts = vi.mocked(api.getAccounts);
const mockGetTransactions = vi.mocked(api.getTransactions);
const mockGetConnections = vi.mocked(api.getConnections);
const mockUseAuth = vi.mocked(useAuth);

const user = {
  id: 'u-1',
  email: 'ana@email.com',
  name: 'Ana',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAccounts.mockResolvedValue([]);
  mockGetTransactions.mockResolvedValue([]);
  mockGetConnections.mockResolvedValue([]);
  mockUseAuth.mockReturnValue({
    mfaDisable: vi.fn().mockResolvedValue(undefined),
  } as never);
});

test('dashboard mostra loading enquanto a API responde e renderiza os dados depois', async () => {
  mockGetAccounts.mockResolvedValueOnce([
    {
      id: 'a-1',
      name: 'Conta principal',
      institution: 'Banco X',
      type: 'manual',
      currency: 'BRL',
      balanceCents: '123450',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ]);
  mockGetTransactions.mockResolvedValueOnce([
    {
      id: 't-1',
      accountId: 'a-1',
      userId: 'u-1',
      description: 'Salário',
      amountCents: '500000',
      type: 'income',
      origin: 'manual',
      providerId: null,
      date: '2026-11-10',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ]);

  render(<FinanceApp user={user} />);

  // Estado de carregamento inicial enquanto a API responde.
  screen.getByText('Carregando…');

  await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Visão geral' }));
  await waitFor(() => expect(mockGetAccounts).toHaveBeenCalled());

  screen.getByText('Conta principal');
  screen.getByText('Salário');
});

test('dashboard exibe mensagem de erro quando a API falha', async () => {
  mockGetAccounts.mockRejectedValueOnce(new Error('Serviço indisponível.'));

  render(<FinanceApp user={user} />);

  await waitFor(() => screen.getByText('Serviço indisponível.'));
});
