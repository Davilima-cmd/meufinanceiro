# Arquitetura do Meu Financeiro

## Decisões de Stack

| Camada | Tecnologia | Versão | Justificativa |
|--------|------------|--------|---------------|
| Runtime | Node.js | 24.x | LTS atual, performance, suporte nativo a fetch/ESM |
| Package Manager | pnpm | 12.x | Velocidade, disk efficiency, workspaces nativos |
| Monorepo | Turborepo | 2.x | Cache inteligente, pipeline paralela, adoção crescente |
| Language | TypeScript | 5.5.x | Type safety, DX, ecossistema maduro |
| API | NestJS | 11.x | Arquitetura modular, DI, decorators, OpenAPI nativo |
| Web | Next.js | 15.x | App Router, RSC, performance, SEO |
| Mobile | Expo | 52.x | SDK gerenciado, OTA updates, ecossistema React Native |
| Testing | Jest | 29.x | Padrão da indústria, snapshot, coverage |
| Linting | ESLint | 9.x | Flat config, performance, regras TypeScript |
| Formatting | Prettier | 3.x | Opinionated, zero config, integração universal |

## Estrutura do Monorepo

```
meufinanceiro/
├── apps/                    # Aplicações deployáveis
│   ├── api/                # NestJS - REST API
│   ├── web/                # Next.js - Frontend web
│   └── mobile/             # Expo - App móvel
├── packages/               # Pacotes internos (não publicados)
│   ├── shared-types/       # Tipos TypeScript compartilhados
│   ├── validation/         # Validação (Zod-like, sem dependência)
│   ├── design-tokens/      # Design system tokens
│   ├── money/              # Dinheiro em centavos (BigInt)
│   ├── eslint-config/      # ESLint config compartilhada
│   └── tsconfig/           # TS configs base por target
├── .github/                # GitHub Actions, Dependabot
├── docs/                   # Documentação técnica
└── Configs raiz            # turbo.json, pnpm-workspace.yaml, etc.
```

## Compartilhamento de Código

**Estratégia:** Pacotes internos TypeScript (`@meufinanceiro/*`) publicados no workspace pnpm.

- **Vantagens:** Type safety end-to-end, versionamento atômico, tree-shaking, cache Turbo
- **Imports:** `@meufinanceiro/shared-types`, `@meufinanceiro/money`, etc.
- **Build:** Cada pacote compila para `dist/` com declarações `.d.ts`

## Configurações Não-Óbvias

### `.npmrc` - `node-linker=hoisted`

**Motivo:** Expo/Metro não suporta PnP (Plug'n'Play) do pnpm. O hoisted cria `node_modules` plano compatível com bundlers nativos do React Native.

```ini
node-linker=hoisted
package-import-method=clone
auto-install-peers=true
```

### TypeScript Paths

`tsconfig.base.json` define:
```json
"paths": {
  "@meufinanceiro/*": ["packages/*/src"]
}
```
Permite imports limpos durante desenvolvimento (`import { x } from '@meufinanceiro/money'`). No build, cada pacote gera sua própria declaração.

### Turborepo Pipeline

```json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "lint": { "cache": true },
    "typecheck": { "cache": true },
    "test": { "outputs": ["coverage/**"], "cache": true },
    "dev": { "cache": false, "persistent": true }
  }
}
```
- `dependsOn: ["^build"]` garante ordem topológica (dependências buildam primeiro)
- `cache: true` para tasks determinísticas (lint, typecheck, test)
- `persistent: true` para `dev` (servidores long-running)

## Pacote `money` - Decisão de Design

**Por que pacote separado (`packages/money`) e não em `shared-types`?**

1. **Domínio distinto:** Lógica monetária ≠ tipos genéricos
2. **Testes específicos:** 20+ casos de teste (zero, negativos, grandes, arredondamento)
3. **Evolução independente:** Precision, moedas, formatação locale
4. **Reuso:** Útil em API, Web, Mobile, workers, scripts
5. **BigInt nativo:** Evita `float`/`decimal.js` - performance + zero dependências

**API principal:**
```typescript
fromReais('10.50')      // string → Centavos (BigInt)
formatBRL(centavos)     // Centavos → 'R$ 10,50'
add(a, b)               // Soma segura
sum([...])              // Soma array
```

## Segurança

Ver [`docs/security.md`](security.md) para detalhes completos.

**Resumo:**
- `.env.example` com valores falsos (nunca `.env` real no Git)
- Gitleaks na CI + config customizada (`.gitleaks.toml`)
- Dependabot semanal para npm + GitHub Actions
- Branch protection + 2FA obrigatório (configurar no GitHub)
- Permissões mínimas no workflow (`contents: read`)

## Pendências Conhecidas

| Item | Fase | Descrição |
|------|------|-----------|
| Banco de dados / Prisma | 1 | Schema, migrations, seed |
| Autenticação (JWT, refresh) | 2 | Login, register, middleware |
| Design System completo | 1 | Componentes, Storybook, tokens reais |
| Open Finance integration | 3 | mTLS, consentimento, sincronização |
| Deploy (Vercel/Render) | 4 | Preview deploys, produção |
| Observabilidade | 4 | Logs estruturados, métricas, tracing |
| Testes E2E | 2 | Playwright (web), Detox (mobile) |
| CI: Docker build/test | 4 | Imagens multi-stage, cache layers |

## Versionamento

- **Monorepo:** Versionamento unificado (semantic-release futuro)
- **Pacotes:** `0.0.0` (privados, não publicados no npm)
- **Apps:** Versionamento próprio no deploy

## Convenções

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`)
- **Branches:** `feature/*`, `fix/*`, `chore/*` → PR para `main`
- **Imports:** `@meufinanceiro/*` para pacotes internos, paths absolutos (`@/`) nos apps