import type { FinanceAccount } from './types';

/**
 * Dono da conta? A API já manda `isMine`, mas os dados de demonstração só têm
 * `ownerId` — comparar com o usuário da sessão cobre os dois modos.
 */
export function isOwnAccount(account: FinanceAccount, userId: string): boolean {
  if (account.isMine === false) return false;
  if (account.ownerId && userId && account.ownerId !== userId) return false;
  return true;
}

/**
 * Conta compartilhada é somente leitura em qualquer nível. A interface usa
 * isso para não oferecer uma ação que a API vai recusar com 403.
 */
export function isReadOnlyAccount(account: FinanceAccount, userId: string): boolean {
  return account.access?.readOnly === true || !isOwnAccount(account, userId);
}
