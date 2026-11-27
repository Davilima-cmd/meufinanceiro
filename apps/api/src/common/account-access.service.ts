import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { visibleAccountsWhere, visibleTransactionsWhere } from '../common/account-access';

/**
 * Autorização centralizada.
 *
 * Antes, cada controller repetia o mesmo `where: { userId }` — e era fácil
 * esquecer um (ou escolher `403` onde o certo era `404`). Aqui a regra vive num
 * lugar só:
 *
 * - **conta**: própria, ou compartilhada com o usuário em `BALANCE_ONLY`/`FULL`;
 * - **escrita**: só o dono, em qualquer nível (compartilhar é somente leitura);
 * - **lançamento**: do usuário, ou de uma conta compartilhada em `FULL`.
 *
 * Qualquer controller pode usar os helpers de consulta (`listAccountsWhere` etc.)
 * e checar acesso pontual com `assertAccount`/`assertWritable` — sem consultar
 * o banco duas vezes nem duplicar a regra.
 */
@Injectable()
export class AccountAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtro Prisma de contas visíveis (próprias + compartilhadas). */
  listAccountsWhere(userId: string) {
    return visibleAccountsWhere(userId);
  }

  /** Filtro Prisma de lançamentos legíveis (próprios + `FULL`). */
  listTransactionsWhere(userId: string) {
    return visibleTransactionsWhere(userId);
  }

  /**
   * Garante que o usuário pode **ver** a conta e devolve o dono.
   *
   * Responde `404` para conta de terceiro: dizer `403` confirmaria que a conta
   * existe, o que já é informação demais para quem não tem acesso.
   */
  async assertVisible(userId: string, accountId: string): Promise<{ ownerId: string }> {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, ...visibleAccountsWhere(userId) },
      select: { userId: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
    return { ownerId: account.userId };
  }

  /**
   * Garante que o usuário pode **escrever** na conta (só o dono pode) e
   * devolve o dono. `404` se a conta não existe nem é visível, `403` com
   * mensagem clara se é compartilhada.
   */
  async assertWritable(userId: string, accountId: string): Promise<{ ownerId: string }> {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id: accountId, ...visibleAccountsWhere(userId) },
      select: { userId: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
    if (account.userId !== userId) {
      throw new ForbiddenException(
        'Conta compartilhada é somente leitura. Só o dono registra ou altera lançamentos nela.'
      );
    }
    return { ownerId: account.userId };
  }
}

/** Decorator informativo: marca rotas que exigem escrita na conta informada. */
export const WRITABLE_ACCOUNT_KEY = 'writable_account_param';
export function RequiresWritableAccount(param = 'id') {
  // Mesmo formato do `@Throttle`/`@AuditLog`: aplicado em método, o alvo é o
  // próprio descriptor; em classe, é o construtor.
  return (
    target: object,
    _key?: string | symbol,
    descriptor?: PropertyDescriptor
  ): PropertyDescriptor | object => {
    if (descriptor) {
      Reflect.defineMetadata(WRITABLE_ACCOUNT_KEY, param, descriptor.value as object);
      return descriptor;
    }
    Reflect.defineMetadata(WRITABLE_ACCOUNT_KEY, param, target);
    return target;
  };
}

/**
 * Guard opcional para rotas marcadas com `@RequiresWritableAccount('id')`.
 *
 * Fica disponível para controllers novos; as rotas atuais chamam
 * `assertWritable` diretamente porque já precisam do registro carregado para
 * montar a resposta (evita duas consultas).
 */
@Injectable()
export class WritableAccountGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccountAccessService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const param = this.reflector.get<string | undefined>(
      WRITABLE_ACCOUNT_KEY,
      context.getHandler()
    );
    if (!param) return true;

    const request = context.switchToHttp().getRequest<{
      params: Record<string, string>;
      user?: { userId: string };
    }>();
    const accountId = request.params?.[param];
    if (!accountId || !request.user?.userId) return true;

    await this.access.assertWritable(request.user.userId, accountId);
    return true;
  }
}
