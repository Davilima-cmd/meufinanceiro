import { describe, expect, it } from 'vitest';
import {
  billingBucket,
  billingDueDate,
  billingItems,
  billingSummary,
  reminderText,
} from '@/lib/billing';
import type { FinanceTransaction } from '@/lib/types';

/**
 * Contas a pagar/receber: o que é urgente, o que é lembrete e o que já não é
 * mais dívida.
 */
function transaction(overrides: Partial<FinanceTransaction>): FinanceTransaction {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    categoryId: null,
    description: 'Aluguel',
    amountCents: '-150000',
    type: 'expense',
    origin: 'manual',
    date: '2026-11-10',
    status: 'pending',
    dueDate: '2026-11-10',
    createdAt: '2026-11-01T12:00:00Z',
    ...overrides,
  };
}

const TODAY = '2026-11-25';

describe('billingDueDate', () => {
  it('usa o vencimento quando existe', () => {
    expect(billingDueDate(transaction({ dueDate: '2026-11-30' }))).toBe('2026-11-30');
  });

  it('cai na data do lançamento quando não há vencimento', () => {
    expect(billingDueDate(transaction({ dueDate: null, date: '2026-12-05' }))).toBe('2026-12-05');
  });
});

describe('billingBucket', () => {
  it('classifica atraso, hoje, próximos dias e futuro', () => {
    expect(billingBucket(-1)).toBe('overdue');
    expect(billingBucket(0)).toBe('due-today');
    expect(billingBucket(3)).toBe('soon');
    expect(billingBucket(4)).toBe('upcoming');
  });
});

describe('billingItems', () => {
  it('ignora pago e cancelado', () => {
    const items = billingItems(
      [
        transaction({ id: 'pendente' }),
        transaction({ id: 'pago', status: 'paid' }),
        transaction({ id: 'cancelado', status: 'canceled' }),
      ],
      TODAY
    );

    expect(items.map((item) => item.transaction.id)).toEqual(['pendente']);
  });

  it('ordena do mais atrasado para o mais distante', () => {
    const items = billingItems(
      [
        transaction({ id: 'futuro', dueDate: '2026-12-20' }),
        transaction({ id: 'atrasado', dueDate: '2026-11-01' }),
        transaction({ id: 'hoje', dueDate: TODAY }),
      ],
      TODAY
    );

    expect(items.map((item) => item.transaction.id)).toEqual(['atrasado', 'hoje', 'futuro']);
    expect(items[0].bucket).toBe('overdue');
    expect(items[1].days).toBe(0);
  });

  it('identifica receita pelo sinal do valor', () => {
    const items = billingItems(
      [
        transaction({ id: 'despesa', amountCents: '-100' }),
        transaction({ id: 'receita', amountCents: '100', type: 'income' }),
      ],
      TODAY
    );

    expect(items.find((item) => item.transaction.id === 'receita')?.isIncome).toBe(true);
    expect(items.find((item) => item.transaction.id === 'despesa')?.isIncome).toBe(false);
  });
});

describe('billingSummary', () => {
  it('soma em módulo — receber não anula pagar', () => {
    const items = billingItems(
      [
        transaction({ id: 'a', amountCents: '-10000', dueDate: '2026-11-20' }),
        transaction({ id: 'b', amountCents: '10000', dueDate: '2026-11-20', type: 'income' }),
      ],
      TODAY
    );

    const summary = billingSummary(items);
    expect(summary.overdueCents).toBe(20000n);
    expect(summary.overdueCount).toBe(2);
  });

  it('separa atrasado, hoje e próximos', () => {
    const items = billingItems(
      [
        transaction({ id: 'a', amountCents: '-3000', dueDate: '2026-11-01' }),
        transaction({ id: 'b', amountCents: '-2000', dueDate: TODAY }),
        transaction({ id: 'c', amountCents: '-1000', dueDate: '2026-11-27' }),
        transaction({ id: 'd', amountCents: '-5000', dueDate: '2026-12-30' }),
      ],
      TODAY
    );

    const summary = billingSummary(items);
    expect(summary.overdueCents).toBe(3000n);
    expect(summary.dueTodayCents).toBe(2000n);
    expect(summary.soonCents).toBe(1000n);
    expect(summary.pendingCents).toBe(11000n);
    expect(summary.urgentCents).toBe(5000n);
  });

  it('lista vazia zera tudo', () => {
    expect(billingSummary([])).toEqual({
      overdueCents: 0n,
      dueTodayCents: 0n,
      soonCents: 0n,
      pendingCents: 0n,
      urgentCents: 0n,
      overdueCount: 0,
      dueTodayCount: 0,
      soonCount: 0,
    });
  });
});

describe('reminderText', () => {
  const summary = (overrides: Partial<ReturnType<typeof billingSummary>>) => ({
    ...billingSummary([]),
    ...overrides,
  });

  it('sem nada urgente não gera lembrete', () => {
    expect(reminderText(billingSummary([]))).toBeNull();
  });

  it('prioriza atraso e junta com o que vence hoje', () => {
    expect(reminderText(summary({ overdueCount: 2, dueTodayCount: 1 }))).toBe(
      '2 conta(s) atrasada(s) e 1 vencendo hoje.'
    );
  });

  it('fala só de atraso quando é o único problema', () => {
    expect(reminderText(summary({ overdueCount: 3 }))).toBe(
      '3 conta(s) atrasada(s) esperando pagamento.'
    );
  });

  it('avisa sobre o que vence hoje', () => {
    expect(reminderText(summary({ dueTodayCount: 1 }))).toBe('1 conta(s) vencem hoje.');
  });

  it('menciona a janela dos próximos dias', () => {
    expect(reminderText(summary({ soonCount: 2 }))).toBe('2 conta(s) vencem nos próximos 3 dias.');
  });
});
