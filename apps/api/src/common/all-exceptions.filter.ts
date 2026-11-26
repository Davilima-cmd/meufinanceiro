import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { captureException } from './sentry';

/**
 * Filtro global de exceções.
 *
 * O filtro padrão do Nest responde certo, mas não deixa rastro: um erro 500 em
 * produção só aparecia no log da função. Aqui:
 *
 * - erros 5xx (e qualquer exceção não-HTTP) vão para o Sentry, quando ligado;
 * - tudo é logado com método, caminho e status, sem o corpo da requisição
 *   (que pode conter senha);
 * - a resposta ao cliente continua a do Nest, sem detalhe interno.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('HttpError');

  override catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<{
      method?: string;
      path?: string;
      url?: string;
      user?: { userId?: string };
    }>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const description = `${request?.method ?? '?'} ${request?.path ?? request?.url ?? '?'} → ${status}`;

    if (status >= 500) {
      this.logger.error(
        `${description} (user ${request?.user?.userId ?? 'anônimo'})`,
        exception instanceof Error ? exception.stack : String(exception)
      );
      captureException(exception);
    } else {
      // 4xx é comportamento esperado (validação, permissão): uma linha basta.
      this.logger.warn(description);
    }

    super.catch(exception, host);
  }
}
