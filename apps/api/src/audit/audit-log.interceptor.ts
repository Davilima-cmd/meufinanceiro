import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { catchError, throwError } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import { asJson } from '../common/json';
import { AUDIT_LOG_ACTION } from './audit-log.decorator';
import { Reflector } from '@nestjs/core';

/**
 * Campos que nunca devem ser gravados no log de auditoria (secrets do corpo da requisição).
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'mfaCode',
  'totpCode',
  'recoveryCode',
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitize(val);
      }
    }
    return result;
  }
  return value;
}

/**
 * Mapeamento de rota -> ação para endpoints sensíveis que ainda não tenham
 * o decorador @AuditLog aplicado. Garante auditoria mesmo por padrão de rota.
 */
const AUDIT_ACTIONS_BY_ROUTE: Record<string, string> = {
  'POST /auth/login': 'LOGIN',
  'POST /auth/register': 'REGISTER',
  'POST /auth/mfa/enable': 'MFA_ENABLE',
  'POST /auth/mfa/disable': 'MFA_DISABLE',
  'POST /open-finance/connections': 'ACCOUNT_CONNECT',
  'PATCH /open-finance/connections/:id/revoke': 'ACCOUNT_REVOKE',
  'POST /transactions': 'TRANSACTION_CREATE',
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly reflector: Reflector
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const decoratedAction = this.reflector.get<string | undefined>(
      AUDIT_LOG_ACTION,
      context.getHandler()
    );
    const request: any = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const userId = request.user?.userId ?? null;
    const fallbackAction = AUDIT_ACTIONS_BY_ROUTE[`${request.method} ${request.route?.path ?? ''}`];
    const action = decoratedAction ?? fallbackAction;

    if (!action) return next.handle();

    const write = (result: unknown, statusCode: number | null) =>
      this.auditLog
        .log({
          userId: userId ?? (result as { user?: { id?: string } } | null)?.user?.id ?? null,
          action,
          target:
            request.params?.id ??
            request.body?.accountId ??
            ((result as { id?: string } | null)?.id ? String((result as { id: string }).id) : null),
          metadata: asJson({
            method: request.method,
            path: request.path,
            route: request.route?.path ?? null,
            statusCode,
            body: sanitize(request.body),
            ip: request.ip ?? null,
          }),
        })
        .catch(() => undefined);

    return next.handle().pipe(
      tap((result) => void write(result, response.statusCode ?? null)),
      /**
       * A tentativa que **falha** é a que mais importa em auditoria: sem este
       * ramo, um login com senha errada, um 403 de CSRF ou um 409 de cadastro
       * duplicado não deixavam rastro nenhum — e força bruta ficava invisível.
       */
      catchError((error: unknown) => {
        const status =
          typeof error === 'object' && error !== null && 'getStatus' in error
            ? Number((error as { getStatus: () => number }).getStatus())
            : null;
        void write(null, status);
        return throwError(() => error);
      })
    );
  }
}
