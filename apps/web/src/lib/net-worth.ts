import type { FinanceAccount, NetWorthItem, NetWorthItemKind } from '@/lib/types';
import { toCents } from '@/lib/format';

/**
 * Patrimônio líquido: saldo das contas + bens declarados − dívidas.
 *
 * O número que a maioria dos apps mostra ("quanto eu tenho") é só ativo. Quem
 * tem financiamento sabe que isso é ficção: aqui o passivo entra subtraindo, e
 * a tela sempre separa os três valores para não dar margem a dúvida.
 */

export type NetWorthSummary = {
  accountsTotalCents: bigint;
  assetsCents: bigint;
  liabilitiesCents: bigint;
  netCents: bigint;
};

export function summarizeNetWorth(
  accounts: FinanceAccount[],
  items: NetWorthItem[] | undefined
): NetWorthSummary {
  // Conta inativa/excluída não é patrimônio disponível.
  const accountsTotalCents = accounts
    .filter((account) => account.isActive !== false)
    .reduce((total, account) => total + toCents(account.balanceCents), 0n);

  let assetsCents = 0n;
  let liabilitiesCents = 0n;
  for (const item of items ?? []) {
    const value = toCents(item.valueCents);
    if (item.kind === 'liability') liabilitiesCents += value;
    else assetsCents += value;
  }

  return {
    accountsTotalCents,
    assetsCents,
    liabilitiesCents,
    netCents: accountsTotalCents + assetsCents - liabilitiesCents,
  };
}

/**
 * Dívida como proporção do que se tem. Serve para a barra de "quanto do seu
 * patrimônio está comprometido" — 100% significa que a dívida engoliu o ativo.
 */
export function debtRatio(summary: NetWorthSummary): number {
  const assets = summary.accountsTotalCents + summary.assetsCents;
  if (assets <= 0n) return summary.liabilitiesCents > 0n ? 100 : 0;
  const percent = (Number(summary.liabilitiesCents) / Number(assets)) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export type { NetWorthItemKind };
