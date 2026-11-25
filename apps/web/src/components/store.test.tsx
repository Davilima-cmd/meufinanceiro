import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { FinanceProvider, useFinance } from '@/lib/store';
import { toCents } from '@/lib/format';

function wrapper({ children }: { children: React.ReactNode }) {
  return <FinanceProvider>{children}</FinanceProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('FinanceProvider (modo demonstração)', () => {
  it('começa sem sessão e com dados de exemplo', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.session).toBeNull();
    expect(result.current.snapshot.accounts.length).toBeGreaterThan(0);
  });

  it('entra no modo demonstração e cria lançamento ajustando o saldo', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.startDemo());
    await waitFor(() => expect(result.current.session?.mode).toBe('demo'));

    const account = result.current.snapshot.accounts[0];
    const saldoAntes = toCents(account.balanceCents);
    const totalAntes = result.current.snapshot.transactions.length;

    await act(async () => {
      await result.current.addTransaction({
        accountId: account.id,
        categoryId: null,
        description: 'Café da tarde',
        amountCents: '-1234',
        type: 'expense',
        date: '2026-11-25',
      });
    });

    await waitFor(() => expect(result.current.snapshot.transactions).toHaveLength(totalAntes + 1));
    const atualizada = result.current.snapshot.accounts.find((item) => item.id === account.id);
    expect(toCents(atualizada?.balanceCents ?? '0')).toBe(saldoAntes - 1234n);
    expect(result.current.snapshot.transactions[0].description).toBe('Café da tarde');
  });

  it('excluir lançamento devolve o valor ao saldo', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.startDemo());
    await waitFor(() => expect(result.current.session?.mode).toBe('demo'));

    const transaction = result.current.snapshot.transactions[0];
    const account = result.current.snapshot.accounts.find(
      (item) => item.id === transaction.accountId
    );
    const saldoAntes = toCents(account?.balanceCents ?? '0');

    await act(async () => {
      await result.current.deleteTransaction(transaction.id);
    });

    await waitFor(() =>
      expect(result.current.snapshot.transactions.some((item) => item.id === transaction.id)).toBe(
        false
      )
    );
    const atualizada = result.current.snapshot.accounts.find(
      (item) => item.id === transaction.accountId
    );
    expect(toCents(atualizada?.balanceCents ?? '0')).toBe(
      saldoAntes - toCents(transaction.amountCents)
    );
  });

  it('alterar o nível de compartilhamento reflete imediatamente', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.startDemo());
    await waitFor(() => expect(result.current.session?.mode).toBe('demo'));

    const account = result.current.snapshot.accounts.find((item) => item.shareLevel === 'private');
    expect(account).toBeDefined();

    await act(async () => {
      result.current.setShareLevel(account!.id, 'FULL');
    });

    await waitFor(() =>
      expect(
        result.current.snapshot.accounts.find((item) => item.id === account!.id)?.shareLevel
      ).toBe('FULL')
    );
  });

  it('sair limpa a sessão e restaura os dados de exemplo', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.startDemo());
    await waitFor(() => expect(result.current.session?.mode).toBe('demo'));

    const totalComAjustes = result.current.snapshot.transactions.length;
    await act(async () => {
      await result.current.addTransaction({
        accountId: result.current.snapshot.accounts[0].id,
        categoryId: null,
        description: 'Teste',
        amountCents: '-100',
        type: 'expense',
        date: '2026-11-25',
      });
    });
    act(() => result.current.signOut());

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.snapshot.transactions).toHaveLength(totalComAjustes);
  });
});
