import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_ACTION = 'audit_log_action';

export enum AuditAction {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  MFA_ENABLE = 'MFA_ENABLE',
  MFA_DISABLE = 'MFA_DISABLE',
  ACCOUNT_CONNECT = 'ACCOUNT_CONNECT',
  ACCOUNT_REVOKE = 'ACCOUNT_REVOKE',
  ACCOUNT_DELETE = 'ACCOUNT_DELETE',
  TRANSACTION_CREATE = 'TRANSACTION_CREATE',
}

/**
 * Marca um endpoint para gravação de log de auditoria.
 * Ex.: @AuditLog(AuditAction.LOGIN)
 */
export function AuditLog(action: AuditAction | string) {
  return SetMetadata(AUDIT_LOG_ACTION, action);
}
