import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AuditAction } from '../src/audit/audit-log.decorator';

/**
 * Auditoria (trilha do que aconteceu com dados do usuário).
 *
 * Dois defeitos que este teste trava:
 * 1. a exclusão de conta gravava **dois** registros — `ACCOUNT_DELETE` (pelo
 *    interceptor, via decorador) e `ACCOUNT_DELETED` (escrito à mão no
 *    serviço). Quem consultava o histórico para provar o direito à exclusão
 *    via duas linhas para um ato só;
 * 2. ação escrita como texto solto em qualquer ponto do código não aparecia no
 *    enum, então não dava para saber o que o sistema registra.
 */

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const allSources = files(SRC).filter(
  (file) => file.endsWith('.ts') && !file.includes(`${'audit'}`)
);

describe('auditoria — cobertura e consistência', () => {
  it('toda ação usada no código vem do enum AuditAction', () => {
    const handWritten: string[] = [];
    for (const file of allSources) {
      const content = readFileSync(file, 'utf8');
      // `action: 'ALGO'` escrito à mão em vez de AuditAction.ALGO.
      for (const match of content.matchAll(/action:\s*'([A-Z][A-Z0-9_]*)'/g)) {
        handWritten.push(`${file}: ${match[1]}`);
      }
    }
    expect(handWritten).toEqual([]);
  });

  it('a ação do serviço de exclusão de conta é a mesma do decorador', () => {
    const service = readFileSync(join(SRC, 'auth', 'auth.service.ts'), 'utf8');
    expect(service).toContain('action: AuditAction.ACCOUNT_DELETE');
    // O nome antigo não pode voltar como valor de `action` (o comentário que
    // explica o bug menciona a string, e isso é intencional).
    expect(service).not.toMatch(/action:\s*'ACCOUNT_DELETED'/);
    expect(service).not.toMatch(/action:\s*ACCOUNT_DELETED\b/);
  });

  it('rotas sensíveis estão decoradas com @AuditLog (não só no mapa de fallback)', () => {
    const expected: Array<[file: string, action: string]> = [
      ['auth/auth.controller.ts', 'LOGIN'],
      ['auth/auth.controller.ts', 'REGISTER'],
      ['auth/auth.controller.ts', 'ACCOUNT_DELETE'],
      ['mfa/mfa.controller.ts', 'MFA_ENABLE'],
      ['mfa/mfa.controller.ts', 'MFA_DISABLE'],
      ['transactions/transactions.controller.ts', 'TRANSACTION_CREATE'],
      ['transactions/transactions.controller.ts', 'TRANSACTION_DELETE'],
    ];

    for (const [file, action] of expected) {
      const content = readFileSync(join(SRC, file), 'utf8');
      expect(content, `${file} deveria registrar ${action}`).toContain(
        `AuditLog(AuditAction.${action})`
      );
    }
  });

  it('o enum cobre todas as ações que o produto registra', () => {
    const actions = Object.values(AuditAction);
    for (const required of [
      'LOGIN',
      'REGISTER',
      'MFA_ENABLE',
      'MFA_DISABLE',
      'ACCOUNT_DELETE',
      'TRANSACTION_SETTLE',
      'PASSWORD_RESET',
      'ALLOCATION_SETTLE',
    ]) {
      expect(actions).toContain(required);
    }
    // Sem duplicatas (dois nomes para o mesmo ato era o bug original).
    expect(new Set(actions).size).toBe(actions.length);
  });
});
