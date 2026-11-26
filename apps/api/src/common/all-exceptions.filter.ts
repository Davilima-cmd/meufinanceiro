import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { clearSessionCookies } from '../auth/session-cookie';
import { captureException } from './sentry';

/** O que usamos da resposta HTTP: limpar cookies. Tipado local para não
 * depender dos tipos do Express (o pacote não é dependência direta do api). */
type CookieResponse = {
  cookie: (name: string, value: string, options?: Record<string, unknown>) => unknown;
  clearCookie: (name: string, options?: Record<string, unknown>) => unknown;
};

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
    const http = host.switchToHttp();
    const request = http.getRequest<{
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

    // 401 significa que a sessão apresentada não vale mais. Se a requisição veio
    // por cookie, apagamos os cookies agora: sem isso, o navegador guarda um
    // `mf_session` morto que a página não consegue remover (`HttpOnly`, e de
    // outro domínio) e ele reaparece na próxima escrita — que o `CsrfGuard`
    // então recusa com 403, como aconteceu ao tentar se cadastrar.
    if (status === HttpStatus.UNAUTHORIZED) {
      try {
        clearSessionCookies(http.getResponse<CookieResponse>());
      } catch {
        // Resposta já enviada / sem suporte a cookie: seguir sem quebrar o erro.
      }
    }

    super.catch(exception, host);
  }
}
