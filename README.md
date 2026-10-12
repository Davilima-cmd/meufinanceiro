# Meu Financeiro

Monorepo para aplicação de controle financeiro pessoal com integração Open Finance (Brasil).

## Visão Geral

Este monorepo contém três aplicações principais:

- **apps/api** - Backend NestJS (REST API)
- **apps/web** - Frontend Next.js (App Router)
- **apps/mobile** - App móvel Expo + React Native

E pacotes compartilhados:

- **packages/shared-types** - Tipos TypeScript compartilhados
- **packages/validation** - Utilitários de validação
- **packages/design-tokens** - Tokens de design (cores, espaçamento, tipografia)
- **packages/money** - Utilitários monetários (centavos com BigInt)
- **packages/eslint-config** - Configuração ESLint compartilhada
- **packages/tsconfig** - Configurações TypeScript base

## Pré-requisitos

- **Node.js** >= 24 (ver `.nvmrc`)
- **pnpm** >= 12 (ver `package.json#packageManager`)
- **Git**

## Instalação

```bash
# Clone o repositório
git clone https://github.com/Davilima-cmd/meufinanceiro.git
cd meufinanceiro

# Instale dependências
pnpm install

# Configure variáveis de ambiente (copie os .env.example)
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

## Comandos Disponíveis

### Raiz do Monorepo

```bash
# Desenvolvimento (roda todos os apps em paralelo)
pnpm dev

# Build de todos os apps e pacotes
pnpm build

# Lint em todo o código
pnpm lint

# Typecheck em todo o código
pnpm typecheck

# Testes em todo o código
pnpm test

# Formatação com Prettier
pnpm format
```

### Apps Individuais

```bash
# API (NestJS)
pnpm --filter api dev          # Modo desenvolvimento (watch)
pnpm --filter api start:prod   # Produção
pnpm --filter api test         # Testes
pnpm --filter api build        # Build

# Web (Next.js)
pnpm --filter web dev          # Modo desenvolvimento
pnpm --filter web build        # Build de produção
pnpm --filter web start        # Servidor de produção
pnpm --filter web test         # Testes

# Mobile (Expo)
pnpm --filter mobile start     # Inicia Metro bundler
pnpm --filter mobile android   # Abre no Android
pnpm --filter mobile ios       # Abre no iOS
pnpm --filter mobile web       # Abre no navegador
pnpm --filter mobile test      # Testes
```

## Estrutura do Repositório

```
meufinanceiro/
├── apps/
│   ├── api/          # NestJS API
│   ├── web/          # Next.js App Router
│   └── mobile/       # Expo + React Native
├── packages/
│   ├── shared-types/     # Tipos compartilhados
│   ├── validation/       # Validação
│   ├── design-tokens/    # Design tokens
│   ├── money/            # Utilitários monetários (BigInt)
│   ├── eslint-config/    # ESLint config
│   └── tsconfig/         # TypeScript configs
├── docs/
│   ├── architecture.md   # Decisões de arquitetura
│   ├── security.md       # Práticas de segurança
│   └── especificacao_final.md
├── .github/
│   ├── workflows/ci.yml  # CI/CD
│   └── dependabot.yml    # Dependabot config
├── .husky/               # Git hooks
├── turbo.json            # Turborepo config
├── pnpm-workspace.yaml   # pnpm workspaces
└── package.json          # Root package.json
```

## Variáveis de Ambiente

Cada app tem seu `.env.example` com variáveis documentadas:

| App | Arquivo | Descrição |
|-----|---------|-----------|
| Root | `.env.example` | Variáveis globais (DB, Auth, Open Finance) |
| API | `apps/api/.env.example` | Configurações do backend |
| Web | `apps/web/.env.example` | Configurações do frontend (NEXT_PUBLIC_*) |
| Mobile | `apps/mobile/.env.example` | Configurações do mobile (EXPO_PUBLIC_*) |

**⚠️ Nunca commite arquivos `.env` com valores reais!** Use apenas `.env.example` no Git.

## Testes

```bash
# Todos os testes
pnpm test

# Testes de um pacote específico
pnpm --filter @meufinanceiro/money test
pnpm --filter @meufinanceiro/validation test

# Testes de um app específico
pnpm --filter api test
pnpm --filter web test
pnpm --filter mobile test
```

## Qualidade de Código

- **TypeScript** strict mode em todos os pacotes
- **ESLint** + **Prettier** com configuração compartilhada
- **Husky** + **lint-staged** no pre-commit
- **Conventional Commits** (recomendado)

## CI/CD

O pipeline roda em todo push/PR para `main`:

1. **Install** - `pnpm install` com cache
2. **Lint** - `pnpm lint`
3. **Typecheck** - `pnpm typecheck`
4. **Test** - `pnpm test`
5. **Build** - `pnpm build`
6. **Secret Scanning** - Gitleaks

## Documentação

- [Arquitetura](docs/architecture.md) - Decisões técnicas e estrutura
- [Segurança](docs/security.md) - Práticas e checklist de segurança
- [Especificação Final](docs/especificacao_final.md) - Requisitos completos

## Licença

Privado - Todos os direitos reservados.