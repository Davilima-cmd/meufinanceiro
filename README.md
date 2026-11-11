# Meu Financeiro

Aplicativo financeiro para duas pessoas, com versões web e Android e uma API única. A especificação funcional está em [`docs/especificacao_final.md`](docs/especificacao_final.md).

## Estrutura

- `apps/web`: interface web em Next.js, React e TypeScript.
- `apps/mobile`: aplicativo Android em React Native e Expo.
- `apps/api`: API em NestJS.
- `packages/shared-types`: contratos compartilhados entre as aplicações.
- `packages/validation`: tipos para resultados de validação de entrada.
- `packages/design-tokens`: medidas compartilhadas da interface.

A base do monorepo usa pnpm workspaces e Turborepo. Banco (PostgreSQL/Prisma) e autenticação (JWT) estão implementados; endpoints documentados em `docs/api-endpoints.md`.

## Requisitos

- Node.js 24 (mínimo suportado: 20.9).
- pnpm 9.0.0 (`corepack enable` pode ativar a versão fixada em `package.json`).

## Instalação e desenvolvimento

```sh
pnpm install
pnpm dev
```

A interface web fica em `http://localhost:3000`. A API inicia na porta `3001`, com verificação em `http://localhost:3001/api/health`. O Expo abre o fluxo de desenvolvimento do aplicativo móvel.
## Verificações

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

O workflow do GitHub Actions executa essas verificações em pushes para `main` e pull requests.

## Docker Compose (PostgreSQL + API + Web)

Sobe todo o ecossistema em containers: PostgreSQL 18 (`db`), API NestJS (`api`, porta 3001) e Next.js (`web`, porta 3000), com health checks e ordem de inicialização (`db` → `api` → `web`).

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
O PostgreSQL 18 está instalado localmente na máquina. Crie o banco `meufinanceiro`, copie `.env.example` para `.env`, então:
```sh
pnpm install
npx prisma migrate dev
pnpm dev
```
A web fica em http://localhost:3000 e a API em http://localhost:3001.

## Variáveis locais

`.env.example` é o modelo de variáveis de ambiente. A porta da API pode ser definida pela variável `API_PORT`. Arquivos `.env` são ignorados pelo Git. Não use dados bancários reais durante o desenvolvimento; a especificação exige dados fictícios e sandbox.

## Escopo atual

A Fase 0 estabelece o monorepo, builds, lint, typecheck, testes de exemplo, CI e documentação. Cadastro, movimentações, compartilhamento, banco de dados e integração Open Finance ainda não estão disponíveis.
