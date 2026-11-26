import { describe, expect, it } from 'vitest';
import { buildView } from './view';
import type { Snapshot } from './api';

/**
 * Tradução snapshot → tela.
 *
 * Se isto erra, o app conectado mostra número errado — que é pior do que não
 * mostrar nada.
 */
const snapshot = {
  accounts: [
    {
      id: 'acc-1',
      name: 'Corrente',
      institution: 'Nubank',
      type: 'checking',
      currency: 'BRL',
      balanceCents: '150000',
      shareLevel: 'private',
      ownerId: 'u1',
      ownerName: 'Davi',
      isActive: true,
    },
    {
      id: 'acc-2',
      name: 'Do casal',
      institution: null,
      type: 'checking',
      currency: 'BRL',
      balanceCents: '50000',
      shareLevel: 'FULL',
      ownerId: 'u2',
      ownerName: 'Ana',
      isActive: true,
    },
  ],
  transactions: [
    {
      id: 'tx-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      description: 'Salário',
      amountCents: '800000',
      type: 'income',
      origin: 'manual',
      date: '2026-11-05',
      status: 'paid',
      createdAt: '2026-11-05T12:00:00Z',
    },
    {
      id: 'tx-2',
      accountId: 'acc-1',
      categoryId: 'cat-2',
      description: 'Mercado',
      amountCents: '-200000',
      type: 'expense',
      origin: 'manual',
      date: '2026-11-10',
      status: 'paid',
      createdAt: '2026-11-10T12:00:00Z',
    },
    {
      id: 'tx-3',
      accountId: 'acc-1',
      categoryId: 'cat-2',
      description: 'Padaria',
      amountCents: '-50000',
      type: 'expense',
      origin: 'manual',
      date: '2026-11-20',
      status: 'paid',
      createdAt: '2026-11-20T12:00:00Z',
    },
  ],
  categories: [
    { id: 'cat-1', name: 'Salário', color: '#0f0', isSystem: true },
    { id: 'cat-2', name: 'Alimentação', color: '#00f', isSystem: true },
  ],
  goals: [],
} as unknown as Snapshot;

describe('buildView', () => {
  // `buildView` só devolve null sem snapshot; aqui há um.
  const view = buildView(snapshot)!;

  it('soma o saldo de todas as contas visíveis', () => {
    expect(view.balanceCents).toBe(200000n);
  });

  it('calcula entradas e saídas a partir dos lançamentos', () => {
    expect(view.incomeCents).toBe(800000n);
    expect(view.expenseCents).toBe(250000n);
  });

  it('agrupa despesas por categoria e calcula o percentual', () => {
    const food = view.categories.find((item) => item.name === 'Alimentação');

    expect(food?.cents).toBe(250000n);
    expect(food?.percent).toBe(100);
  });

  it('ordena lançamentos do mais recente para o mais antigo', () => {
    expect(view.transactions.map((item) => item.id)).toEqual(['tx-3', 'tx-2', 'tx-1']);
  });

  it('mostra a data no formato brasileiro', () => {
    expect(view.transactions[0].date).toBe('20/11/2026');
  });

  it('marca conta compartilhada como somente leitura', () => {
    expect(view.accounts[1].share).toMatch(/somente leitura/i);
  });
});
