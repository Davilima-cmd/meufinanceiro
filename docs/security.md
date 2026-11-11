# Segurança e privacidade

Este aplicativo tratará dados financeiros. A segurança precisa ser implementada e revisada antes de
qualquer dado bancário real; a Fase 0 não conecta banco nem autentica usuários.

## Regras para desenvolvimento

- Não usar dados bancários reais. Usar dados fictícios e sandbox.
- Nunca pedir ou guardar senha bancária.
- Nunca colocar credenciais, tokens ou chaves no Git, logs, testes ou documentação.
- Guardar valores locais em `.env`, ignorado pelo Git. `.env.example` contém apenas campos vazios.
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

## Controles previstos, ainda pendentes

- Cookie web `HttpOnly`, `Secure`, `SameSite` e proteção CSRF.
- Autorização centralizada para dono, compartilhamento e nível de acesso.
- Limites contra força bruta, abuso de endpoints e enumeração de contas.
- Validação de entrada em todos os endpoints.
- Webhooks autenticados, idempotentes e com proteção contra duplicidade.

Nenhum controle listado como pendente deve ser considerado implementado apenas por estar
documentado. Revisar esta lista nas fases 2, 4, 5 e 6 da especificação.

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
