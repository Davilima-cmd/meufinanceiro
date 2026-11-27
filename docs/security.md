# Segurança e privacidade

Este aplicativo tratará dados financeiros. A segurança precisa ser implementada e revisada antes de
qualquer dado bancário real; a Fase 0 não conecta banco nem autentica usuários.

## Regras para desenvolvimento

- Não usar dados bancários reais. Usar dados fictícios e sandbox.
- Nunca pedir ou guardar senha bancária.
- Nunca colocar credenciais, tokens ou chaves no Git, logs, testes ou documentação.
- Guardar valores locais em `.env` (e `.env.local`), ignorados pelo Git. `.env.example` contém
  apenas placeholders/exemplos — nenhum valor real.
- Tokens de provedores Open Finance devem ficar no backend quando essa integração for criada.
- Não confiar em `userId` enviado pelo cliente; a identidade deverá vir da sessão validada no
  servidor.

## Controles implementados (Fase 5)

- Hash de senhas com Argon2id (`apps/api/src/auth/auth.service.ts`).
- Sessões revogáveis (modelo `Session` com `tokenHash` e `expiresAt`).
- MFA (TOTP): suporte a tokens TOTP com emissor definido por `TOTP_ISSUER` (ver `.env.example`).
  Ativação e desativação de MFA são ações sensíveis auditadas.
- Criptografia de campos sensíveis na aplicação com **AES-256-GCM**, chave mantida fora do banco via
  variável `ENCRYPTION_KEY` (exemplo em `.env.example`; nunca commitar o valor real).
- Rate limit de sincronização: `POST /open-finance/sync` limitado por frequência (configurável via
  `SYNC_RATE_LIMIT_MINUTES`, padrão 5 minutos; erro `429` com `Retry-After`). A varredura diária não
  está sujeita ao limite; o resultado é registrado em `sync_jobs`, idempotente pelo identificador do
  provedor.
- Auditoria de ações: `AuditLogInterceptor` registrado globalmente (via `APP_INTERCEPTOR`) grava em
  `audit_logs` para `LOGIN`, `REGISTER`, `MFA_ENABLE`, `MFA_DISABLE`, `ACCOUNT_CONNECT`,
  `ACCOUNT_REVOKE`, `ACCOUNT_DELETE` e `TRANSACTION_CREATE`, com `userId`, `action`, `target`,
  `metadata` (corpo da requisição sanitizado — senhas/tokens são `[REDACTED]`) e `createdAt`.
- Secret scanning com Gitleaks (`.gitleaks.toml`) no CI.
- Dependabot para atualização de dependências (ecossistema npm/pnpm via GitHub).
- Nenhum segredo no Git: `.env`, `.env.local` e quaisquer arquivos `.env.*` (exceto `.env.example`)
  são ignorados pelo `.gitignore` na raiz do repositório.

## Revisão de segurança — resultado da auditoria

| Controle                                               | Status        | Evidência                                                                                                                                       |
| ------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Nenhum segredo no Git (`.env`, `.env.local`, `.env.*`) | ✅ Verificado | `.gitignore` ignora `.env` e `.env.*`; apenas `.env.example` (placeholders) é rastreado; `git check-ignore` confirma                            |
| Sem segredos reais no histórico                        | ✅ Verificado | `git log -S` para `senha123`, `ENCRYPTION_KEY=`, `JWT_SECRET=` retornam apenas placeholders (`dev-secret-change-me`, `SENHA`, exemplo de chave) |
| Hash de senhas com Argon2id                            | ✅ Verificado | `apps/api/src/auth/auth.service.ts` (`argon2.hash`/`argon2.verify`, padrão Argon2id); `argon2@0.45.2`                                           |
| Criptografia AES-256-GCM (campos sensíveis)            | ✅ Verificado | `apps/api/src/encryption/encryption.service.ts` (`createCipheriv('aes-256-gcm')`); chave validadora de 32 bytes via `ENCRYPTION_KEY`            |
| MFA (TOTP) ativo                                       | ✅ Verificado | `apps/api/src/mfa/mfa.service.ts`; segredo TOTP cifrado com AES-256-GCM em `User.totpSecret`                                                    |
| Rate limit de sincronização (429)                      | ✅ Verificado | `apps/api/src/sync/sync.service.ts` (`enforceRateLimit` → `429` com `Retry-After`); `SYNC_RATE_LIMIT_MINUTES`                                   |
| Secret scanning (Gitleaks)                             | ✅ Verificado | `.gitleaks.toml` configurado e executado no CI (`.github/workflows/ci.yml`)                                                                     |
| Cookie `HttpOnly` + CSRF                               | ✅ Verificado | `apps/api/src/auth/session-cookie.ts`, `csrf.guard.ts`; `csrf.guard.test.ts`                                                                     |
| Sessão revogável (`sid` no JWT)                        | ✅ Verificado | `apps/api/src/auth/session.service.ts`; `session.service.test.ts`                                                                                |
| Autorização centralizada                               | ✅ Verificado | `apps/api/src/common/account-access.service.ts`; `account-access.service.test.ts`                                                                |
| Rate limit global e de autenticação                    | ✅ Verificado | `@nestjs/throttler` em `app.module.ts`/`auth.module.ts`; `rate-limit.test.ts`                                                                    |
| Soft delete com filtro de leitura                      | ✅ Verificado | `prisma/migrations/20261126180000_soft_delete`; `transactions.service.test.ts`, `accounts.controller.test.ts`                                     |
| Testes de segurança                                    | ✅ Passam     | `apps/api`: 28 arquivos / 228 testes verdes; web 12/97; mobile 2/15; `lint`, `typecheck`, `test` e `build` verdes                                |

Observações: `dev-secret-change-me`, `SENHA` e `exemplo_de_chave...` são placeholders de
desenvolvimento, não segredos reais. Nunca substituí-los por valores reais no Git.

## Controles implementados (fase 6 — sessão, CSRF e autorização)

- **Sessão revogável de verdade.** O JWT carrega o `sid` (`sessions.id`) e cada requisição
  autenticada confere `sessions.revokedAt`/`expiresAt`. `POST /auth/logout` revoga a sessão atual,
  `POST /auth/logout-all` todas; trocar a senha revoga todas. Token antigo **sem** `sid` é rejeitado
  com `401` — não existe caminho para token "eterno".
- **Cookie `HttpOnly` + CSRF.** A web recebe `mf_session` (`HttpOnly`, `Secure` em produção,
  `SameSite=None`, porque web e API ficam em domínios diferentes) e `mf_csrf` (legível **no
  domínio da API**). Toda escrita exige `X-CSRF-Token` igual ao cookie; o `CsrfGuard` isenta
  `GET`/`HEAD`/`OPTIONS` e requisições com `Authorization: Bearer` (que não carregam cookie
  ambiente, logo não sofrem CSRF). O JWT **não** é gravado em `localStorage`.
  - **Como a web obtém o valor.** O cookie `mf_csrf` pertence ao domínio da API, portanto
    `document.cookie` da página **não** o enxerga. O valor vai no corpo de `/auth/login`,
    `/auth/mfa/verify` e `GET /auth/status` (leitura same-origin-only) e o cliente o guarda só em
    memória. Como o token é `sha256("csrf:" + sessionId)` e não derivado do JWT, `/auth/status` o
    recalcula a cada carga da página — recarregar o app não quebra a escrita. Sem isso, toda
    escrita autenticada por cookie respondia `403`.
  - Regressões cobertas por `apps/api/test/csrf.cross-domain.test.ts` e
    `apps/web/src/lib/csrf.test.ts`.
- **Autorização centralizada.** `AccountAccessService` (`apps/api/src/common/account-access.service.ts`)
  é a única fonte de verdade para "posso ver / posso escrever": `assertVisible` responde `404` e
  `assertWritable` responde `403` quando a conta é de outra pessoa. Serviços de lançamento, conta,
  orçamento e Open Finance passam por ele em vez de refazer `where` a mão.
- **Limites contra força bruta e abuso.** `@nestjs/throttler` global em 120 req/min/IP
  (`RATE_LIMIT_PER_MINUTE`) e limites específicos: register 5, login 10, forgot-password 3,
  reset-password 10, mfa/verify 10 — todos em 60 s, com `429` e `Retry-After`. `forgot-password`
  responde sempre igual, com ou sem conta, para não permitir enumeração de e-mails.
- **Soft delete em vez de apagar histórico (requisito 23).** `FinancialAccount.deletedAt` e
  `Transaction.deletedAt` (com índice). `DELETE /accounts/:id` apaga em transação a conta, seus
  lançamentos e revoga os compartilhamentos; `DELETE /transactions/:id` marca `deletedAt` e devolve
  o valor ao saldo. Toda leitura filtra `deletedAt: null` — inclusive a reconciliação, que não pode
  recriar o que o usuário apagou de propósito.
- **Observabilidade de erro.** Filtro global `AllExceptionsFilter`: `4xx` em uma linha de `warn`,
  `5xx` com stack no log e envio ao Sentry (`SENTRY_DSN`). O `beforeSend` remove `cookie`,
  `authorization` e `x-csrf-token` do evento — relatório de erro não pode virar vazamento de sessão.
- **Documentação de API fechada por padrão.** `/api/docs` só existe fora de produção ou com
  `ENABLE_API_DOCS=true`.
- **CI em branches de trabalho.** O workflow roda em `main` **e** em `arena/**`, então o push de
  trabalho é verificado antes do merge (antes só o PR era).
- **Auditoria ampliada** para `LOGIN`, `LOGOUT`, `REGISTER`, `MFA_ENABLE`, `MFA_DISABLE`,
  `ACCOUNT_CONNECT`, `ACCOUNT_REVOKE`, `ACCOUNT_DELETE`, `TRANSACTION_CREATE`,
  `ALLOCATION_UPSERT`, `ALLOCATION_SETTLE` e `RECURRENCE_CREATE`, com corpo sanitizado
  (`[REDACTED]` em senhas e tokens).

## Controles previstos, ainda pendentes

- Auditoria **endpoint a endpoint** de todos os DTOs de entrada (não apenas dos endpoints cobertos
  por teste): falta uma varredura formal de cada campo aceito versus cada campo usado.
- Segundo fator obrigatório para ações destrutivas (exclusão de conta, `logout-all`) quando `MFA`
  estiver ativo.
- Rotação periódica de `ENCRYPTION_KEY` com reencriptação dos campos sensíveis.
- Teste de integração ponta a ponta com banco real em CI (os testes atuais exercitam serviços e
  guards com Prisma dublado).
- Alerta de anomalia de acesso (muitos 401/403 por usuário) além do rate limit por IP.

Nenhum controle listado como pendente deve ser considerado implementado apenas por estar
documentado.

## Políticas LGPD e privacidade de dados

### Nenhum dado bancário real

Não armazene e nunca armazene dados bancários reais: credenciais, senhas de instituição, cartões ou
dados de titular de conta corrente. Durante o desenvolvimento e no sandbox use somente dados
fictícios e o provedor sandbox da integração Open Finance. Tokens de provedor, quando existirem,
ficam apenas no backend.

### Retenção de dados

Dados pessoais e financeiros são retidos apenas enquanto a conta do usuário existir:

| Categoria                                                     | Retenção                                    | Destino após o prazo/evento                                                              |
| ------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cadastro do usuário (nome, e-mail, preferências)              | Enquanto a conta estiver ativa              | Excluído com a conta (`DELETE /auth/account`)                                            |
| Sessões e tokens JWT                                          | Até expiração ou logout                     | Excluídos ao expirar ou logout                                                           |
| Contas financeiras, transações, categorias, orçamentos, metas | Enquanto a conta estiver ativa              | Excluídos em cascade com a conta                                                         |
| Compartilhamentos de conta (`account_shares`)                 | Até revogação do dono ou exclusão da conta  | Revogados (data de revogação registrada) ou excluídos em cascade                         |
| Conexões e consentimentos Open Finance                        | Até revogação ou expiração do consentimento | Excluídos em cascade com a conta                                                         |
| Logs de auditoria                                             | 12 meses                                    | `userId` é anulado na exclusão da conta; o registro da ação é mantido sem dados pessoais |
| Eventos de webhook                                            | 90 dias                                     | Excluídos por rotina de limpeza                                                          |
| Jobs de sincronização                                         | 12 meses                                    | Excluídos em cascade com a conta                                                         |

### Direito de exclusão (LGPD — art. 18)

O titular pode pedir a exclusão da própria conta e de todos os dados relacionados a qualquer
momento:

1. Pelo aplicativo: autenticar e chamar `DELETE /api/auth/account` (ou a opção "Excluir minha conta"
   nas configurações da web). A exclusão é imediata e irreversível.
2. Por outro canal (e-mail de contato publicado no app): a equipe responde em até 7 dias e executa a
   exclusão após confirmar a identidade do solicitante.

O que a exclusão faz:

- Revoga todos os compartilhamentos de contas titularizados pelo usuário (efeito imediato para o
  parceiro).
- Remove os compartilhamentos recebidos de outros usuários.
- Exclui o usuário e, em cascade, sessões, parcerias, contas financeiras, transações, categorias,
  orçamentos, metas, conexões Open Finance, consentimentos e jobs de sincronização.
- Mantém logs de auditoria com o `userId` anulado, sem dados pessoais, apenas como evidência da
  ação.

Exceções: dados que devam ser mantidos por obrigação legal são retidos apenas pelo período
necessário, sem dados bancários (que nunca são armazenados).

### Compartilhamento de contas (revogável)

Toda conta é privada até o dono compartilhar. O dono define o nível (`BALANCE_ONLY` ou `FULL`) e
pode revogar o acesso a qualquer momento, com efeito imediato. Conexões Open Finance podem ser
desconectadas com `PATCH /open-finance/connections/:id/revoke`. Ao excluir a conta, todos os
compartilhamentos titularizados são revogados e cada parte mantém apenas os próprios dados.
