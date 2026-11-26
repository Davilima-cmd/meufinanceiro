import { describe, expect, it } from 'vitest';
import {
  accessFromShares,
  isShareLevel,
  visibleAccountsWhere,
  visibleTransactionsWhere,
} from '../src/common/account-access';

describe('regras de acesso por conta compartilhada', () => {
  it('conta sem compartilhamento não é visível ao parceiro', () => {
    expect(accessFromShares([])).toEqual({
      canSeeBalance: false,
      canSeeTransactions: false,
      readOnly: true,
    });
  });

  it('BALANCE_ONLY vê o saldo, nunca o histórico', () => {
    const access = accessFromShares([{ sharedWithId: 'u2', level: 'BALANCE_ONLY' }]);
    expect(access.canSeeBalance).toBe(true);
    expect(access.canSeeTransactions).toBe(false);
  });

  it('FULL vê saldo e histórico, mas continua somente leitura', () => {
    const access = accessFromShares([{ sharedWithId: 'u2', level: 'FULL' }]);
    expect(access.canSeeBalance).toBe(true);
    expect(access.canSeeTransactions).toBe(true);
    expect(access.readOnly).toBe(true);
  });

  it('escolhe o nível mais aberto quando há compartilhamentos duplicados', () => {
    const access = accessFromShares([
      { sharedWithId: 'u2', level: 'BALANCE_ONLY' },
      { sharedWithId: 'u2', level: 'FULL' },
    ]);
    expect(access.canSeeTransactions).toBe(true);
  });

  it('valida os níveis aceitos', () => {
    expect(isShareLevel('FULL')).toBe(true);
    expect(isShareLevel('private')).toBe(true);
    expect(isShareLevel('delete')).toBe(false);
    expect(isShareLevel(undefined)).toBe(false);
  });

  it('o filtro de contas esconde o que não foi compartilhado', () => {
    const where = visibleAccountsWhere('u2');
    expect(where.OR[0]).toEqual({ userId: 'u2' });
    expect(JSON.stringify(where.OR[1])).toContain('BALANCE_ONLY');
    expect(JSON.stringify(where.OR[1])).toContain('revokedAt');
  });

  it('o filtro de lançamentos só abre contas FULL', () => {
    const where = visibleTransactionsWhere('u2');
    expect(where.OR[0]).toEqual({ userId: 'u2' });
    expect(JSON.stringify(where.OR[1])).toContain('"level":"FULL"');
    expect(JSON.stringify(where.OR[1])).not.toContain('BALANCE_ONLY');
  });
});
