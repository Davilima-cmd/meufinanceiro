# Meu Financeiro

Painel financeiro para um casal: contas, lançamentos, orçamentos e metas em um só lugar, com
privacidade por conta. Aplicativo web completo (modo demonstração + integração com a API), API
NestJS, app móvel Expo e pacotes compartilhados. A especificação funcional está em
[`docs/especificacao_final.md`](docs/especificacao_final.md).

## Interface web

O app web (`apps/web`) tem oito áreas: **Visão geral**, **Lançamentos**, **Contas**, **Orçamentos**,
**Metas**, **Categorias**, **Casal** e **Configurações**.

- **Modo demonstração**: entre em `/login` → “Entrar no modo demonstração”. Dados fictícios do casal
  (5 contas, 6 meses de lançamentos, orçamentos e metas) gerados de forma determinística e salvos
  apenas no `localStorage` do navegador. Tudo pode ser criado, editado e excluído; “Restaurar dados
  de exemplo” volta ao estado inicial.
- **Modo API**: em “Tenho uma conta”, o login usa `NEXT_PUBLIC_API_BASE`. Cadastro, login, MFA
  (TOTP) e os endpoints de contas, lançamentos, categorias, orçamentos e metas são consumidos de
  verdade.
- **Regras de privacidade** aplicadas na interface: uma conta mostra o histórico completo quando é
  sua ou quando foi compartilhada como `FULL`; no nível `BALANCE_ONLY` o parceiro vê apenas o saldo
  (esses lançamentos ficam fora dos relatórios). Contas privadas nunca aparecem na visão conjunta.
- **Dinheiro em centavos**: toda soma é feita com `BigInt` e só é formatada em reais na tela, o que
  evita erro de arredondamento. Transferências não contam como despesa nem consomem orçamento.
- Tema escuro/claro, “ocultar valores”, gráficos em SVG sem dependências e layout responsivo com
  navegação inferior no celular.

```sh
pnpm install
pnpm --filter @meufinanceiro/shared-types build   # pacotes consumidos pela web
pnpm --filter @meufinanceiro/web dev              # http://localhost:3000
```

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

## Docker Compose (PostgreSQL + API + Web) — implantação e operações

Sobe todo o ecossistema em containers: PostgreSQL 18 (`db`), API NestJS (`api`, porta 3001) e
Next.js (`web`, porta 3000), com health checks e ordem de inicialização (`db` → `api` → `web`).

### Requisitos

- Docker Desktop com Docker Compose v2.
- Portas 5432, 3000 e 3001 livres no host.

### Primeiro uso

```sh
cp .env.example .env   # edite os valores abaixo antes de subir
pnpm docker-up         # builda as imagens e sobe os serviços em segundo plano
```

### Variáveis obrigatórias do `.env`

Configure pelo menos estas variáveis (valores de exemplo impedem o deploy):

| Variável               | Exemplo                                                  | Observação                                    |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `DATABASE_URL`         | `postgres://postgres:senha@localhost:5432/meufinanceiro` | URL de conexão do Prisma (aplicação)          |
| `DATABASE_URL_DIRECT`  | `postgres://postgres:senha@localhost:5432/meufinanceiro` | URL direta (usada pelas migrations)           |
| `JWT_SECRET`           | `openssl rand -base64 32`                                | Segredo para assinar tokens JWT               |
| `ENCRYPTION_KEY`       | `openssl rand -hex 32`                                   | Chave AES-256-GCM para campos sensíveis       |
| `TOTP_ISSUER`          | `Meu Financeiro`                                         | Emissor exibido nos apps autenticadores (MFA) |
| `NODE_ENV`             | `development`                                            | `development` ou `production`                 |
| `API_PORT`             | `3001`                                                   | Porta da API no container/host                |
| `WEB_ORIGIN`           | `http://localhost:3000`                                  | Origem da web para CORS                       |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:3001/api`                              | Base da API exposta ao navegador              |

Gere os segredos com:

```sh
openssl rand -base64 32   # JWT_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY
```

### Script de deploy

`scripts/deploy.sh` (ou `scripts/deploy.ps1` no PowerShell) automatiza todo o fluxo:

```sh
./scripts/deploy.sh        # Git Bash / WSL / Linux
.\scripts\deploy.ps1       # PowerShell (Windows)
```

O script: valida o `.env`, builda as imagens, sobe os serviços, aguarda os health checks de `db`,
`api` e `web`, e roda `docker compose exec api pnpm prisma migrate deploy`.

### Health checks

- API: `GET http://localhost:3001/api/health` → responde `{ status: 'ok', db: 'ok' }` quando a API e
  o banco estão disponíveis (503 se o banco estiver indisponível).
- Web: `GET http://localhost:3000/` → responde quando o Next.js está servindo.
- Os health checks também são usados pelo Docker Compose (`db` → `api` → `web`) e pelo script de
  deploy antes de aplicar as migrations.

### Serviços e URLs

- Web: http://localhost:3000
- API: http://localhost:3001 — health check em http://localhost:3001/api/health
- PostgreSQL: localhost:5432 (usuário `postgres`, banco `meufinanceiro`)

### Comandos de operações

```sh
pnpm docker-up                    # builda as imagens e sobe os serviços em segundo plano
pnpm docker-logs                  # acompanha logs de todos os serviços
pnpm docker-logs -f api           # logs apenas da API
docker compose exec api pnpm prisma migrate deploy   # aplica migrations pendentes
docker compose exec api pnpm prisma generate         # regenera o cliente Prisma
pnpm docker-down                  # para e remove containers e redes
pnpm docker-clean                 # para, remove containers e o volume de dados do banco (apaga os dados)
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

Crie um banco PostgreSQL, copie `.env.example` para `.env` com a `DATABASE_URL` do banco, então:

```sh
pnpm install
pnpm --filter @meufinanceiro/api exec prisma migrate deploy   # aplica as migrations
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

## Implantação (Vercel + Supabase)

- **Web na Vercel**: projeto `meufinanceiro` com _Root Directory_ `apps/web`, build
  `pnpm turbo run build --filter=@meufinanceiro/web...` (o `...` compila antes as dependências
  internas), saída `.next` e install `pnpm install --frozen-lockfile`. Não há `vercel.json`: as
  configurações ficam nas definições do projeto e os cabeçalhos de segurança em
  `apps/web/next.config.ts`. O app sobe mesmo sem a API — a tela de login oferece o modo
  demonstração. Se o projeto estiver com _Deployment Protection → Vercel Authentication_ ligado,
  toda visita cai no login da Vercel; desligue em **Settings → Deployment Protection** para o painel
  ficar público (ou use um domínio próprio, que a proteção não cobre).
- **Banco no Supabase** (PostgreSQL 17, região `sa-east-1`): use a URL direta para migrations
  (`DATABASE_URL_DIRECT`) e a URL do pooler para a aplicação (`DATABASE_URL`), com
  `?pgbouncer=true&connection_limit=1`. O Supabase é usado **apenas** como Postgres: autenticação e
  autorização continuam no NestJS. O schema `public` já está no formato esperado pelo Prisma
  (camelCase + `hide_values`), com as duas migrations aplicadas e registradas em
  `_prisma_migrations`, além das 8 categorias de sistema do `prisma/seed.ts`. Para conferir:
  `psql "$DATABASE_URL_DIRECT" -c '\dt'`.
- **API na Vercel** (projeto `meufinanceiro-api`, _Root Directory_ `apps/api`): o entrypoint é a
  função Zero Config `apps/api/api/index.ts`, que reusa o bootstrap do Nest. Ajustes necessários na
  Vercel — sem eles o deploy quebra com `STATIC_BUILD_NO_OUT_DIR`:
  - **Build Command vazio** (nem no projeto, nem em `apps/api/vercel.json`). Qualquer buildCommand
    faz a Vercel tratar o diretório como site estático.
  - **Install Command**
    `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @meufinanceiro/api exec prisma generate`
    — o `prisma generate` roda no install porque o typecheck do pacote depende do client gerado. Não
    use `--no-engine`: a função precisa do engine.
  - `apps/api/vercel.json`: `outputDirectory: "public"` (com `apps/api/public/index.html`, exigência
    do preset _Other_), o rewrite `/api/(.*) → /api` e `functions["api/index.ts"].includeFiles`
    cobrindo `node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**` para o engine ir
    junto no bundle.
  - `generator client` declara `binaryTargets = ["native", "rhel-openssl-3.0.x"]`, o alvo do runtime
    Amazon Linux da Vercel.
  - `NODE_ENV=production` **não** deve existir como variável de build (derruba o `tsc`); se
    precisar, configure só para runtime.
  - O projeto está com _Deployment Protection → Vercel Authentication_ ligado, então o domínio
    responde com o login da Vercel até a proteção ser desligada ou um domínio próprio ser usado.
- **API em outro host Node** (Render, Azure): variáveis de `.env.example`,
  `pnpm --filter @meufinanceiro/api build`, `prisma generate` + `prisma migrate deploy` no deploy e
  `node dist/main.js` para iniciar (imagens em `apps/api/Dockerfile*`). No plano gratuito do Render
  o serviço hiberna por inatividade — a reconciliação diária cobre isso.

### Componentes de interface

Os controles do painel são próprios, não os do navegador: `apps/web/src/components/dialog.tsx` traz
o `Select` (listbox com teclado) e o `useDialog()` com `confirm`/`notice` — no lugar de `<select>` e
`window.confirm` —, e `apps/web/src/components/date-field.tsx` traz o `DateField` (calendário em
português) no lugar de `<input type="date">`. As confirmações de exclusão de lançamento, conta,
categoria, orçamento e meta e o aviso de limite salvo usam essa camada.

## Escopo atual

Implementado: monorepo, web (demo + API), API com autenticação JWT, MFA TOTP, contas, transações,
categorias, orçamentos, metas, auditoria, criptografia de campos sensíveis e Open Finance em
sandbox. Ainda fora do escopo: transferências/pagamentos reais, compartilhamento persistido no banco
(as tabelas `partnerships`/`account_shares` existem; falta expor endpoints) e recuperação de senha.
