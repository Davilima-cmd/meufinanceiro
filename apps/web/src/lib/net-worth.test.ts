import { describe, expect, it } from 'vitest';
import { debtRatio, summarizeNetWorth } from '@/lib/net-worth';
import type { FinanceAccount, NetWorthItem } from '@/lib/types';

/**
 * Patrimônio: a dívida tem de subtrair. Mostrar só o ativo é o erro que faz o
 * painel mentir para quem tem financiamento.
 */
const account = (overrides: Partial<FinanceAccount> = {}): FinanceAccount => ({
  id: 'acc-1',
  name: 'Corrente',
  institution: null,
  type: 'checking',
  currency: 'BRL',
  balanceCents: '100000',
  shareLevel: 'private',
  ownerId: 'user-1',
  ownerName: 'Davi',
  color: '#7c5cff',
  isActive: true,
  ...overrides,
});

const item = (overrides: Partial<NetWorthItem> = {}): NetWorthItem => ({
  id: 'item-1',
  name: 'Carro',
  kind: 'asset',
  valueCents: '500000',
  note: null,
  ...overrides,
});

describe('summarizeNetWorth', () => {
  it('soma contas e bens e subtrai dívidas', () => {
    const summary = summarizeNetWorth(
      [account({ balanceCents: '100000' })],
      [
        item({ id: 'a', kind: 'asset', valueCents: '500000' }),
        item({ id: 'b', kind: 'liability', valueCents: '450000' }),
      ]
    );

    expect(summary.accountsTotalCents).toBe(100000n);
    expect(summary.assetsCents).toBe(500000n);
    expect(summary.liabilitiesCents).toBe(450000n);
    expect(summary.netCents).toBe(150000n);
  });

  it('ignora conta inativa', () => {
    const summary = summarizeNetWorth(
      [
        account({ balanceCents: '100' }),
        account({ id: 'acc-2', balanceCents: '900', isActive: false }),
      ],
      []
    );

    expect(summary.accountsTotalCents).toBe(100n);
  });

  it('sem itens, patrimônio é o saldo das contas', () => {
    expect(summarizeNetWorth([account({ balanceCents: '2500' })], undefined).netCents).toBe(2500n);
  });

  it('pode ficar negativo quando a dívida é maior que tudo', () => {
    const summary = summarizeNetWorth(
      [account({ balanceCents: '10000' })],
      [item({ kind: 'liability', valueCents: '50000' })]
    );

    expect(summary.netCents).toBe(-40000n);
  });
});

describe('debtRatio', () => {
  it('dívida sobre o ativo em percentual', () => {
    expect(
      debtRatio({
        accountsTotalCents: 50000n,
        assetsCents: 50000n,
        liabilitiesCents: 50000n,
        netCents: 50000n,
      })
    ).toBe(50);
  });

  it('sem ativo e com dívida, considera 100% comprometido', () => {
    expect(
      debtRatio({
        accountsTotalCents: 0n,
        assetsCents: 0n,
        liabilitiesCents: 1000n,
        netCents: -1000n,
      })
    ).toBe(100);
  });

  it('nunca passa de 100%', () => {
    expect(
      debtRatio({
        accountsTotalCents: 1000n,
        assetsCents: 0n,
        liabilitiesCents: 9000n,
        netCents: -8000n,
      })
    ).toBe(100);
  });

  it('sem dívida é zero', () => {
    expect(
      debtRatio({
        accountsTotalCents: 1000n,
        assetsCents: 0n,
        liabilitiesCents: 0n,
        netCents: 1000n,
      })
    ).toBe(0);
  });
});
