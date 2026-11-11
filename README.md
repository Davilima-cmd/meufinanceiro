# Meu Financeiro

Aplicativo financeiro para duas pessoas, com versões web e Android e uma API única. A especificação
funcional está em [`docs/especificacao_final.md`](docs/especificacao_final.md).

## Estrutura

- `apps/web`: interface web em Next.js, React e TypeScript.
- `apps/mobile`: aplicativo Android em React Native e Expo.
- `apps/api`: API em NestJS.
- `packages/shared-types`: contratos compartilhados entre as aplicações.
- `packages/validation`: tipos para resultados de validação de entrada.
- `packages/design-tokens`: medidas compartilhadas da interface.

A base do monorepo usa pnpm workspaces e Turborepo. Banco (PostgreSQL/Prisma) e autenticação (JWT)
estão implementados; endpoints documentados em `docs/api-endpoints.md`.

## Requisitos

- Node.js 24 (mínimo suportado: 20.9).
- pnpm 9.0.0 (`corepack enable` pode ativar a versão fixada em `package.json`).

## Instalação e desenvolvimento

```sh
pnpm install
pnpm dev
```

A interface web fica em `http://localhost:3000`. A API inicia na porta `3001`, com verificação em
`http://localhost:3001/api/health`. O Expo abre o fluxo de desenvolvimento do aplicativo móvel.

## Verificações

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

O workflow do GitHub Actions executa essas verificações em pushes para `main` e pull requests.

## Docker Compose (PostgreSQL + API + Web)

Sobe todo o ecossistema em containers: PostgreSQL 18 (`db`), API NestJS (`api`, porta 3001) e
Next.js (`web`, porta 3000), com health checks e ordem de inicialização (`db` → `api` → `web`).

### Requisitos

- Docker Desktop com Docker Compose v2.
- Portas 5432, 3000 e 3001 livres no host.

### Primeiro uso

```sh
cp .env.example .env   # ajuste DB_PASSWORD se desejar
pnpm docker-up         # builda as imagens e sobe os serviços em segundo plano
```

### Serviços e URLs

- Web: http://localhost:3000
- API: http://localhost:3001 — health check em http://localhost:3001/api/health
- PostgreSQL: localhost:5432 (usuário `postgres`, banco `meufinanceiro`)

### Comandos

```sh
pnpm docker-logs   # acompanha logs de todos os serviços
pnpm docker-down   # para e remove containers e redes
pnpm docker-clean  # para, remove containers e o volume de dados do banco (apaga os dados)
```

### Banco de dados

As migrations do Prisma estão em `apps/api/prisma/migrations`. Após subir os containers, aplique-as:

```sh
docker compose exec api pnpm prisma migrate deploy
```

Se precisar regenerar o cliente Prisma:

```sh
docker compose exec api pnpm prisma generate
```

### Sem Docker (execução local)

O PostgreSQL 18 está instalado localmente na máquina. Crie o banco `meufinanceiro`, copie
`.env.example` para `.env`, então:

```sh
pnpm install
npx prisma migrate dev
pnpm dev
```

A web fica em http://localhost:3000 e a API em http://localhost:3001.

## Open Finance em sandbox e reconciliação (Fase 4)

A integração Open Finance está isolada em `apps/api/src/open-finance` e o provedor **sandbox é
código da API** — não há serviço extra no Docker Compose.

### Variável de ambiente

Copie `.env.example` para `.env` e defina a URL base do sandbox do provedor:

```
OPEN_FINANCE_SANDBOX_BASE_URL=https://sandbox.openfinance.example.com
```

Use apenas dados fictícios e sandbox. Nunca insira credenciais bancárias reais.

### Endpoints (detalhes em `docs/api-endpoints.md`)

- `POST /open-finance/connections` — vincula uma conta do provedor a uma conta local (JWT).
- `GET /open-finance/connections` — lista conexões do usuário logado (JWT).
- `PATCH /open-finance/connections/:id/revoke` — desconecta uma conexão própria (JWT).
- `GET /open-finance/consents` — lista consentimentos (JWT).
- `POST /open-finance/sync` — dispara a sincronização sob demanda ("Sincronizar agora"), criando um
  `sync_job` (JWT).
- `POST /open-finance/webhooks/:provider` — recebe webhooks de transação do provedor (sem
  autenticação; idempotente por `event_id`).

### Reconciliação

Um job diário compara o que o provedor informa com o que está salvo e corrige lacunas, de forma
idempotente pelo identificador do provedor, registrando o resultado em `sync_jobs`. O mesmo fluxo é
disparado sob demanda com `POST /open-finance/sync` (com limite de frequência).

### Rodando com Docker

```sh
cp .env.example .env   # ajuste OPEN_FINANCE_SANDBOX_BASE_URL se necessário
pnpm docker-up         # sobe db → api → web
docker compose exec api pnpm prisma migrate deploy
```

API: http://localhost:3001 (health: /api/health). Web: http://localhost:3000.

## Variáveis locais

`.env.example` é o modelo de variáveis de ambiente. A porta da API pode ser definida pela variável
`API_PORT`. Arquivos `.env` são ignorados pelo Git. Não use dados bancários reais durante o
desenvolvimento; a especificação exige dados fictícios e sandbox.

## LGPD e retenção de dados

- **Nenhum dado bancário real é armazenado:** somente dados fictícios e sandbox são usados em
  desenvolvimento; credenciais bancárias nunca são solicitadas nem salvas (veja `docs/security.md`).
- **Retenção:** dados pessoais e financeiros são mantidos apenas enquanto a conta existir e são
  excluídos em cascade quando a conta é removida; logs de auditoria mantêm o registro da ação com o
  `userId` anulado, sem dados pessoais.
- **Direito de exclusão (art. 18 LGPD):** o titular pode excluir a própria conta e todos os dados
  relacionados a qualquer momento pelo endpoint `DELETE /api/auth/account` (autenticado com JWT). A
  exclusão revoga os compartilhamentos de contas titularizados, remove compartilhamentos recebidos e
  exclui sessões, contas, transações, conexões Open Finance, consentimentos e jobs de sincronização.
- **Compartilhamento revogável:** toda conta é privada até o dono compartilhar; o acesso pode ser
  revogado a qualquer momento, com efeito imediato, e cada parte mantém apenas os próprios dados.

Detalhes completos: [`docs/security.md`](docs/security.md).

## Segurança (Fase 5)

Controles de segurança e privacidade estão documentados em [`docs/security.md`](docs/security.md).
Resumo dos principais itens:

- **Auditoria de ações:** `AuditLogInterceptor` (global na API NestJS) grava em `audit_logs` para
  ações sensíveis: login, cadastro, ativação/desativação de MFA (TOTP), conectar conta, revogar
  conexão, excluir conta e criar transação. Cada registro armazena `userId`, `action`, `target`,
  `metadata` (corpo sanitizado; senhas e tokens são mascarados) e `createdAt`.
- **Criptografia de campos sensíveis:** AES-256-GCM com chave fora do banco, definida pela variável
  `ENCRYPTION_KEY` (exemplo em `.env.example`; valor real nunca vai para o Git).
- **MFA (TOTP):** emissor configurado por `TOTP_ISSUER`.
- **Rate limit de sincronização:** `POST /open-finance/sync` limitado por frequência
  (`SYNC_RATE_LIMIT_MINUTES`, padrão 5 minutos; `429` com `Retry-After`).
- **Secret scanning:** Gitleaks (`.gitleaks.toml`) no CI.
- **Dependabot:** atualização de dependências (npm/pnpm) via GitHub.
- **Nenhum segredo no Git:** `.env`, `.env.local` e demais `.env.*` (exceto `.env.example`) são
  ignorados pelo `.gitignore`.

## Escopo atual

A Fase 0 estabelece o monorepo, builds, lint, typecheck, testes de exemplo, CI e documentação.
Cadastro, movimentações, compartilhamento, banco de dados e integração Open Finance ainda não estão
disponíveis.
