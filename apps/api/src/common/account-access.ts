import { ForbiddenException } from '@nestjs/common';

/**
 * Níveis de compartilhamento de uma conta, do mais restrito ao mais aberto.
 *
 * - `private`: só o dono vê qualquer coisa (nem o saldo).
 * - `BALANCE_ONLY`: o parceiro vê o saldo consolidado, nunca os lançamentos.
 * - `FULL`: o parceiro vê o histórico. Continua **somente leitura**: escrever
 *   na conta de outra pessoa não é uma opção do produto.
 */
export const SHARE_LEVELS = ['private', 'BALANCE_ONLY', 'FULL'] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];

export function isShareLevel(value: unknown): value is ShareLevel {
  return typeof value === 'string' && (SHARE_LEVELS as readonly string[]).includes(value);
}

/** Compartilhamento ativo (não revogado) entre a conta e outro usuário. */
export type ActiveShare = { sharedWithId: string; level: string };

/**
 * Resolve o que um usuário pode fazer numa conta que **não é dele**.
 *
 * A regra fica num lugar só porque as superfícies precisam concordar: se a
 * lista de contas mostrasse uma conta que a lista de lançamentos esconde, a
 * interface mentiria para o usuário.
 */
export function accessFromShares(shares: ActiveShare[]): {
  canSeeBalance: boolean;
  canSeeTransactions: boolean;
  readOnly: true;
} {
  const best = shares.reduce<string>((acc, share) => {
    if (acc === 'FULL') return acc;
    return share.level === 'FULL' ? 'FULL' : acc === 'BALANCE_ONLY' ? acc : share.level;
  }, 'private');

  return {
    canSeeBalance: best === 'FULL' || best === 'BALANCE_ONLY',
    canSeeTransactions: best === 'FULL',
    readOnly: true,
  };
}

/**
 * Filtro Prisma para "contas que este usuário pode ver": as próprias mais as
 * que foram compartilhadas com ele com nível diferente de `private`.
 */
export function visibleAccountsWhere(userId: string) {
  return {
    deletedAt: null,
    OR: [
      { userId },
      {
        shares: {
          some: { sharedWithId: userId, revokedAt: null, level: { in: ['FULL', 'BALANCE_ONLY'] } },
        },
      },
    ],
  };
}

/**
 * Filtro Prisma para lançamentos que o usuário pode ler: os próprios mais os das
 * contas compartilhadas como `FULL`. `BALANCE_ONLY` entra só como número de
 * saldo, nunca como histórico — por isso a condição olha o nível.
 */
export function visibleTransactionsWhere(userId: string) {
  return {
    deletedAt: null,
    OR: [
      { userId },
      {
        account: {
          shares: { some: { sharedWithId: userId, revokedAt: null, level: 'FULL' } },
        },
      },
    ],
  };
}

/** Erro padrão de escrita em conta alheia — a mensagem explica a regra. */
export function readOnlyAccountError(): ForbiddenException {
  return new ForbiddenException(
    'Conta compartilhada é somente leitura. Só o dono registra ou altera lançamentos nela.'
  );
}
