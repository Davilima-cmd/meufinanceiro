import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogProvider } from '@/components/dialog';
import { FinanceProvider, useFinance } from '@/lib/store';
import RecurrencesPage from '@/app/recorrencias/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/recorrencias',
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

describe('Recorrências', () => {
  it('usa os campos com o mesmo estilo do resto do app', async () => {
    render(
      <FinanceProvider>
        <DialogProvider>
          <LoginOnMount />
          <RecurrencesPage />
        </DialogProvider>
      </FinanceProvider>
    );

    const heading = await screen.findByRole('heading', { name: 'Nova recorrência' });
    const form = heading.closest('section') as HTMLElement;
    expect(form).toBeTruthy();

    // Descrição e dia do mês eram os dois campos crus que sobravam: sem
    // `.input` eles ficavam com a borda e a altura padrão do navegador.
    const description = within(form).getByLabelText('Descrição');
    expect(description.className).toContain('input');

    const day = within(form).getByLabelText('Dia do mês');
    expect(day.className).toContain('input');
    // O sufixo "de cada mês" fica dentro da moldura do campo.
    expect(day.parentElement?.className).toContain('day-field');
  });

  it('aceita só dígitos no dia do mês', async () => {
    render(
      <FinanceProvider>
        <DialogProvider>
          <LoginOnMount />
          <RecurrencesPage />
        </DialogProvider>
      </FinanceProvider>
    );

    const day = await screen.findByLabelText('Dia do mês');
    await userEvent.clear(day);
    await userEvent.type(day, '12');

    await waitFor(() => expect((day as HTMLInputElement).value).toBe('12'));
  });
});
