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

  it('entra no modo demonstração e cria lançamento liquidado ajustando o saldo', async () => {
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
        status: 'paid',
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
    await act(async () => {
      await result.current.signOut();
    });

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.snapshot.transactions).toHaveLength(totalComAjustes);
  });
});

describe('FinanceProvider — contas a pagar/receber', () => {
  it('pendente nasce fora do saldo e só entra quando é liquidado', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.startDemo());
    await waitFor(() => expect(result.current.session?.mode).toBe('demo'));

    const account = result.current.snapshot.accounts[0];
    const saldoAntes = toCents(account.balanceCents);

    let criadoId = '';
    await act(async () => {
      await result.current.addTransaction({
        accountId: account.id,
        categoryId: null,
        description: 'Aluguel de dezembro',
        amountCents: '-250000',
        type: 'expense',
        date: '2026-12-01',
        dueDate: '2026-12-05',
      });
    });

    const pendente = result.current.snapshot.transactions.find(
      (item) => item.description === 'Aluguel de dezembro'
    );
    expect(pendente?.status).toBe('pending');
    expect(pendente?.dueDate).toBe('2026-12-05');
    criadoId = pendente?.id ?? '';

    const aposCriar = result.current.snapshot.accounts.find((item) => item.id === account.id);
    expect(toCents(aposCriar?.balanceCents ?? '0')).toBe(saldoAntes);

    await act(async () => {
      await result.current.settleTransaction(criadoId, '2026-12-05');
    });

    const liquidado = result.current.snapshot.transactions.find((item) => item.id === criadoId);
    expect(liquidado?.status).toBe('paid');
    const aposLiquidar = result.current.snapshot.accounts.find((item) => item.id === account.id);
    expect(toCents(aposLiquidar?.balanceCents ?? '0')).toBe(saldoAntes - 250000n);
  });

  it('cancelar um pendente não devolve valor ao saldo', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.startDemo());
    await waitFor(() => expect(result.current.session?.mode).toBe('demo'));

    const account = result.current.snapshot.accounts[0];
    const saldoAntes = toCents(account.balanceCents);

    await act(async () => {
      await result.current.addTransaction({
        accountId: account.id,
        categoryId: null,
        description: 'Curso cancelado',
        amountCents: '-30000',
        type: 'expense',
        date: '2026-12-02',
      });
    });
    const pendente = result.current.snapshot.transactions.find(
      (item) => item.description === 'Curso cancelado'
    );

    await act(async () => {
      await result.current.cancelTransaction(pendente?.id ?? '');
    });

    const cancelado = result.current.snapshot.transactions.find((item) => item.id === pendente?.id);
    expect(cancelado?.status).toBe('canceled');
    const depois = result.current.snapshot.accounts.find((item) => item.id === account.id);
    expect(toCents(depois?.balanceCents ?? '0')).toBe(saldoAntes);
  });

  it('remover um pendente não altera o saldo', async () => {
    const { result } = renderHook(() => useFinance(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.startDemo());
    await waitFor(() => expect(result.current.session?.mode).toBe('demo'));

    const account = result.current.snapshot.accounts[0];
    const saldoAntes = toCents(account.balanceCents);

    await act(async () => {
      await result.current.addTransaction({
        accountId: account.id,
        categoryId: null,
        description: 'Boleto a pagar',
        amountCents: '-9900',
        type: 'expense',
        date: '2026-12-03',
      });
    });
    const pendente = result.current.snapshot.transactions.find(
      (item) => item.description === 'Boleto a pagar'
    );

    await act(async () => {
      await result.current.deleteTransaction(pendente?.id ?? '');
    });

    const depois = result.current.snapshot.accounts.find((item) => item.id === account.id);
    expect(toCents(depois?.balanceCents ?? '0')).toBe(saldoAntes);
  });
});
