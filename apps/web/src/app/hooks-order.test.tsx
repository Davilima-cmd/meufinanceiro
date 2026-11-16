import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

/**
 * C2 - Crash de runtime: "Rendered more hooks than during the previous render".
 *
 * Nas páginas de budgets, categories e goals havia um early return
 * (`if (!mounted || (isLoading && !user)) return null;`) ANTES dos hooks
 * `useCallback` e `useEffect`. Ao autenticar, o componente passa a executar
 * hooks extras e o React aborta a renderização.
 *
 * Este teste reproduz a transição de estado (desautenticado -> autenticado)
 * e exige que o número de hooks permaneça constante.
 */
const authState: { user: unknown; isLoading: boolean } = { user: null, isLoading: false };

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('@/lib/api', () => ({
  api: {
    getBudgets: vi.fn(async () => []),
    getCategories: vi.fn(async () => []),
    getGoals: vi.fn(async () => []),
  },
}));

const PAGES = [
  { name: 'budgets', load: () => import('@/app/budgets/page') },
  { name: 'categories', load: () => import('@/app/categories/page') },
  { name: 'goals', load: () => import('@/app/goals/page') },
];

describe('C2 - ordem de hooks estavel em budgets/categories/goals', () => {
  beforeEach(() => {
    cleanup();
    authState.user = null;
    authState.isLoading = false;
  });

  for (const page of PAGES) {
    it(`a pagina ${page.name} nao quebra ao autenticar`, async () => {
      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
        originalError(...args);
      };

      try {
        const Component = (await page.load()).default;
        const { rerender } = render(<Component />);

        // Primeiro render: desautenticado -> a página pode renderizar nada.
        expect(authState.user).toBeNull();

        // Segundo render: autenticado -> a página passa a executar os hooks
        // de dados. A contagem de hooks NÃO pode mudar.
        authState.user = {
          id: 'u1',
          email: 'davi@example.com',
          name: 'Davi',
          createdAt: '',
          updatedAt: '',
        };

        expect(() => rerender(<Component />)).not.toThrow();

        const hookError = errors.find((e) =>
          e.includes('Rendered more hooks than during the previous render')
        );
        expect(hookError).toBeUndefined();
      } finally {
        console.error = originalError;
      }
    });
  }
});
