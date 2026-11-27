import { SetMetadata } from '@nestjs/common';

/**
 * Marca a rota como pública em relação ao CSRF.
 *
 * O `CsrfGuard` é global e a regra dele é: "se a requisição traz cookie de
 * sessão, escrita precisa provar o token CSRF". Isso faz sentido para rotas
 * autenticadas **por cookie**, mas não para rotas que o usuário chama antes de
 * ter uma sessão válida — cadastro, login, recuperação de senha.
 *
 * Sem este marcador acontece o bug que derrubou o cadastro: o navegador guarda
 * um `mf_session` velho (cookie `HttpOnly` que a página não consegue apagar,
 * nem sempre um 401 limpa), o usuário tenta se cadastrar, a requisição chega
 * com esse cookie e o guard responde `403` antes de qualquer lógica de negócio.
 * O sintoma é cruel porque o cadastro não depende de sessão alguma.
 */
export const SKIP_CSRF = 'skip_csrf';

export function SkipCsrf() {
  return SetMetadata(SKIP_CSRF, true);
}
