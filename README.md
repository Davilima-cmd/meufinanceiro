# Meu Financeiro

Aplicativo financeiro para duas pessoas, com versões web e Android e uma API única. A especificação funcional está em [`docs/especificacao_final.md`](docs/especificacao_final.md).

## Estrutura

- `apps/web`: interface web em Next.js, React e TypeScript.
- `apps/mobile`: aplicativo Android em React Native e Expo.
- `apps/api`: API em NestJS.
- `packages/shared-types`: contratos compartilhados entre as aplicações.
- `packages/validation`: tipos para resultados de validação de entrada.
- `packages/design-tokens`: medidas compartilhadas da interface.

A base do monorepo usa pnpm workspaces e Turborepo. O banco e a autenticação ainda não foram implementados.

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

## Variáveis locais

`.env.example` é um modelo para as próximas fases; atualmente nenhuma aplicação depende de banco ou autenticação e o projeto não carrega automaticamente um arquivo `.env`. A porta da API pode ser definida pela variável `API_PORT`. Arquivos `.env` são ignorados pelo Git. Não use dados bancários reais durante o desenvolvimento; a especificação exige dados fictícios e sandbox.

## Escopo atual

A Fase 0 estabelece o monorepo, builds, lint, typecheck, testes de exemplo, CI e documentação. Cadastro, movimentações, compartilhamento, banco de dados e integração Open Finance ainda não estão disponíveis.
