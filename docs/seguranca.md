# Auditoria de segurança — Meu Financeiro

Data: 2026-11-27 · Escopo: API (`apps/api`), web (`apps/web`), banco de produção (Supabase) e configuração de deploy.

Este documento registra o que foi verificado, o que estava furado e o que mudou. Ele é referência para
a próxima revisão: se um item abaixo for reaberto, a decisão precisa ser reavaliada explicitamente.

---

## 1. Achados críticos (corrigidos)

### 1.1 Banco de produção exposto pela API pública do Supabase — **crítico**

**Estado encontrado:** todas as 20 tabelas do schema `public` com RLS **desligado** e os papéis
`anon` e `authenticated` com `SELECT`, `INSERT`, `UPDATE`, `DELETE` e `TRUNCATE`.

O Supabase publica todo o schema `public` em `https://<ref>.supabase.co/rest/v1/<tabela>`. A chave
`anon`/publicável é pública por definição (vai no bundle do cliente). Com RLS desligado e esses
privilégios, qualquer pessoa podia:

- ler `users` (e-mails), `sessions` (hashes de token), `financial_accounts`, `transactions`;
- **escrever** e **apagar** qualquer registro — inclusive `TRUNCATE` em todas as tabelas.

**Correção aplicada:**

1. `REVOKE ALL` de `anon` e `authenticated` em tabelas, sequences e funções do schema `public`, e nos
   *default privileges* (tabela futura já nasce fechada).
2. `ROW LEVEL SECURITY` ligado nas 19 tabelas da aplicação.
3. Policy `app_api_all` para o papel que a API realmente usa (`app_api`), que **não** é dono das
   tabelas e **não** tem `BYPASSRLS` — sem essa policy o app pararia de funcionar após o passo 2.
4. Migração versionada em `apps/api/prisma/migrations/20261127090000_harden_postgrest_public_schema`.

**Verificado depois:** `anon`/`authenticated` com 0 privilégios, `app_api` com 80 (20 tabelas × 4
operações), 19 tabelas com RLS, `GET /api/health` → `{"status":"ok","db":"ok"}`.

### 1.2 Dado bancário fictício podia virar conta real por variável de ambiente — **crítico**

`OPEN_FINANCE_SANDBOX_IN_PRODUCTION=true` liberava o provedor sandbox em produção; sem credenciais
do Pluggy, **produção** caía no sandbox por padrão. Resultado: conta criada com saldo e lançamentos
inventados dentro da conta real do usuário.

**Correção:** variável removida do código e do ambiente. Sandbox só existe fora de produção
(`NODE_ENV !== 'production'`). Em produção sem credenciais, o módulo injeta `null` e as rotas
respondem erro de configuração — não inventam dados.

### 1.3 IDOR na importação de conta bancária (`POST /open-finance/connect-item`) — **alto**

O `itemId` vinha do navegador e era usado direto para ler contas no agregador. Quem obtivesse o id de
outra pessoa importaria as contas dela para a própria conta no app.

**Correção:** validação de titularidade contra o provedor (`item.clientUserId` é o valor que enviamos
no token do widget). Divergência → `404` (não `403`, que confirmaria a existência do item). Coberto
por teste.

---

## 2. Achados altos (corrigidos)

| # | Problema | Correção |
|---|----------|----------|
| 2.1 | `DELETE /auth/account` apagava tudo só com a sessão | Exige a senha atual no corpo (`DeleteAccountDto`), conferida com argon2; limite de 5/min |
| 2.2 | Auditoria só gravava quando o handler **tinha sucesso** — login com senha errada, 403 de CSRF e 409 não deixavam rastro | Interceptor grava também no `catchError`, com o status do erro |
| 2.3 | Força bruta só limitada por IP (troca de IP a cada tentativa) | Bloqueio progressivo por conta (`LoginThrottleService`, chave = hash do e-mail): 5 falhas/15 min → 15 min de bloqueio, `429` com `retryAfter`; sucesso zera |
| 2.4 | Código TOTP (6 dígitos) sem bloqueio por usuário | Mesmo serviço aplicado ao `/auth/mfa/verify` (`mfa:<userId>`) |
| 2.5 | `GET /auth/mfa/qr-code?secret=` aceitava segredo arbitrário do cliente, em query string (fica em log/histórico) | Novo `GET /auth/mfa/secret` gera o segredo no servidor (CSPRNG); QR aceita só base32 válido |
| 2.6 | `password` do login **sem `MaxLength`** — 1 MB por tentativa ia inteiro para o argon2 (DoS de CPU barato) | Mesmo limite do cadastro (`128`) |
| 2.7 | `name`/`email` do cadastro sem teto | `name` ≤ 120, `email` ≤ 254 |
| 2.8 | `weights` do rateio: `1e308` vira BigInt de 300 dígitos e multiplica o valor do lançamento → CPU/memória | Teto de peso (1e9) e piso (> 0) no cálculo; sanitização no controller devolve `400` em vez de `500` |
| 2.9 | `participants` do rateio sem limite (`ArrayNotEmpty` só) | `ArrayMaxSize(50)` + `Length` por item |
| 2.10 | Ids (`accountId`, `categoryId`, `transferAccountId`, `partnershipId`) sem `Length` — payload de 300 KB por campo | `Length(1, 255)` em todos |
| 2.11 | Webhook do provedor sem rate limit próprio | `@Throttle` 120/min (hoje é o único endpoint público de escrita) |

---

## 3. Endurecimento adicional

- **Cabeçalhos da API** (`bootstrap.ts`): `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`,
  `Cross-Origin-Opener-Policy: same-origin`, HSTS e `x-powered-by` desligado.
- **Limite de corpo**: 1 MB (`MAX_BODY_BYTES`), para JSON e urlencoded. Antes, o parser aceitava o
  padrão do Express (100 KB) — o limite explícito fecha a porta para payloads grandes em qualquer rota.
- **CSP na web** (`next.config.ts`): `connect-src` restrito à própria origem, à API e ao Pluggy;
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, HSTS.

---

## 4. Verificado e **sem** problema (mantido como está)

- **JWT fora do `localStorage`**: a web usa apenas o cookie `HttpOnly`; `api.setToken` existe mas não é
  chamado no fluxo. Token temporário de MFA fica em `sessionStorage` (some ao fechar a aba).
- **CSRF**: double submit com `timingSafeEqual`; rotas públicas com `@SkipCsrf()`; bearer imune por
  definição (header não é enviado por formulário de terceiro).
- **Senhas**: argon2id (64 MiB, t=3), hash comparado em tempo constante pela própria lib.
- **Sessões**: `sid` no token + tabela `sessions`; revogação imediata em logout, troca de senha e
  exclusão de conta; só o SHA-256 do token é guardado.
- **Autorização por recurso**: `AccountAccessService` centraliza "só o dono escreve"; conta de terceiro
  responde `404` (não confirma existência). Conferido em accounts, categories, budgets, goals,
  allocations, recurrences, transactions e sharing.
- **SQL injection**: todas as consultas via Prisma (parametrizadas); nenhuma interpolação de string em
  SQL.
- **XSS**: nenhum `dangerouslySetInnerHTML`; React escapa por padrão.
- **Segredos**: `SENTRY_DSN` remove cookies e `authorization` antes de enviar evento; auditoria mascara
  `password`, `token`, `secret`, `otp` etc.; logs nunca recebem corpo de requisição.
- **Criptografia em repouso**: `EncryptionService` (AES-256-GCM) para campos sensíveis; segredo TOTP
  cifrado.
- **Enumeração de usuários**: `forgot-password` sempre responde `{requested:true}`; login sempre
  "credenciais inválidas".
- **CORS**: allowlist explícita (`WEB_ORIGIN`), obrigatória em produção.

---

## 5. Pendências e riscos residuais (decisão do responsável)

1. **`ENABLE_API_DOCS=true` em produção** — o Swagger está público (`/api/docs`). Exponibiliza o mapa
   da API, não dados. Se não houver uso, remover a variável.
2. **Chaves do Supabase** — depois de 1.1, `anon` não lê nada. Vale **rotacionar** a chave
   publicável/`service_role` por precaução, já que estiveram eficazes por um período.
3. **`TRUNCATE` para `service_role`** — mantido (o `service_role` é o papel administrativo do
   Supabase e não é distribuído ao cliente). Se quiser fechar: revogar `TRUNCATE` dele também.
4. **Rate limit por conta é em memória** — em serverless cada instância tem seu contador. Isso encarece
   o ataque, mas não é um contador global. Se a ameaça justificar, migrar para Redis/Upstash.
5. **`GRANT` do `app_api`** — a policy `app_api_all` concede tudo de propósito: a autorização por
   usuário é feita na aplicação. Um vazamento de credencial do banco continua sendo catastrófico, como
   em qualquer app com um único usuário de banco. Mitigação futura: RLS com `current_setting`
   por requisição.

## 6. Como revalidar

```bash
# API: testes de segurança (entrada, throttle, auditoria, rateio)
pnpm --filter @meufinanceiro/api exec vitest run test/security.input.test.ts

# Banco: nada público com privilégio (deve retornar 0 linhas)
# select * from information_schema.role_table_grants
#  where table_schema='public' and grantee in ('anon','authenticated');
```
