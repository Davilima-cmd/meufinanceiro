# Documentação de Endpoints — API Meu Financeiro

Base URL: `http://localhost:3001/api` (desenvolvimento). Todo o prefixo é `/api`. Autenticação:
`Authorization: Bearer <JWT>` nos endpoints protegidos. JWT emitido em `/auth/login` e
`/auth/register`. Armazenamento no frontend: `localStorage` com chaves `mf_token` (token) e
`mf_user` (usuário JSON).

## Convenções de resposta

Erros seguem o padrão do NestJS:

```json
{ "message": "...", "error": "...", "statusCode": 401 }
```

Códigos HTTP usados: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `500`.

## Endpoints

### Autenticação (público)

| Método | Endpoint         | Descrição                                                             | Corpo da requisição         | Resposta de sucesso                    |
| ------ | ---------------- | --------------------------------------------------------------------- | --------------------------- | -------------------------------------- |
| POST   | `/auth/register` | Cadastra usuário                                                      | `{ email, name, password }` | `200 { user: ApiUser, token: string }` |
| POST   | `/auth/login`    | Autentica e emite JWT                                                 | `{ email, password }`       | `200 { user: ApiUser, token: string }` |
| DELETE | `/auth/account`  | Exclui a conta do usuário logado e todos os dados relacionados (LGPD) | —                           | `204` sem conteúdo                     |

Exemplo de resposta:

```json
{
  "user": { "id": "...", "email": "...", "name": "...", "createdAt": "...", "updatedAt": "..." },
  "token": "eyJ..."
}
```

Erros esperados:

- `400` — corpo inválido (ex: e-mail mal formado, senha curta).
- `401` — credenciais inválidas.
- `409` — e-mail já cadastrado.

### Contas (exige autenticação JWT)

| Método | Endpoint         | Descrição                      | Corpo                                                     | Resposta           |
| ------ | ---------------- | ------------------------------ | --------------------------------------------------------- | ------------------ |
| Método | Endpoint         | Descrição                      | Corpo                                                     | Resposta           |
| ------ | ---------------- | ------------------------------ | -------------------------------------------------         | ------------------ |
| GET    | `/accounts`      | Lista contas do usuário logado | —                                                         | `200 ApiAccount[]` |
| POST   | `/accounts`      | Cria conta                     | `{ name, institution?, type?, currency?, balanceCents? }` | `201 ApiAccount`   |
| PATCH  | `/accounts/:id`  | Edita ou arquiva a conta       | `{ name?, institution?, type?, isActive? }`               | `200 ApiAccount`   |
| DELETE | `/accounts/:id`  | Exclui conta sem histórico     | —                                                         | `200 { deleted }`  |

O `balanceCents` do `POST` é o **saldo inicial**: é gravado como um lançamento "Saldo inicial", de
modo que o saldo continue sendo derivado do histórico. `DELETE` é recusado (`400`) quando a conta
tem lançamentos — nesse caso o caminho correto é arquivar com `PATCH { "isActive": false }`.

Exemplo de conta:

```json
{
  "id": "...",
  "name": "Conta Teste",
  "institution": "Banco X",
  "type": "checking",
  "currency": "BRL",
  "balanceCents": "0",
  "isActive": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Erros: `401` (não autenticado), `400` (body inválido).

### Transações (exige autenticação JWT)

| Método | Endpoint                    | Descrição                                            | Corpo                                                                                  | Resposta               |
| ------ | --------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| GET    | `/transactions`             | Listar transações do usuário                         | —                                                                                      | `200 ApiTransaction[]` |
| POST   | `/transactions`             | Criar lançamento                                     | `{ accountId, description, amountCents, type, categoryId?, transferAccountId?, date }` | `201 ApiTransaction`   |
| POST   | `/transactions/:id/reverse` | Estorna criando o lançamento inverso                 | —                                                                                      | `201 ApiTransaction`   |
| DELETE | `/transactions/:id`         | Remove (estorna as duas pontas de uma transferência) | —                                                                                      | `200 { deleted }`      |

Valores em centavos (string), negativos para despesa e positivos para receita — o servidor recusa
(`400`) despesa positiva, receita negativa e valor zero.

Regras de integridade aplicadas no servidor:

- criar, estornar ou excluir um lançamento ajusta `balanceCents` da conta dentro de uma transação de
  banco, pelo mesmo delta gravado no histórico;
- `type: "transfer"` exige `transferAccountId` (diferente da origem) e cria duas pontas com o mesmo
  `transferId`, uma negativa na origem e outra positiva no destino; transferência nunca conta como
  receita nem despesa;
- excluir uma das pontas remove o par inteiro;
- `categoryId` precisa ser do usuário ou uma categoria do sistema (`isSystem`).

### Recuperação de senha (público)

| Método | Endpoint                | Corpo                 | Resposta                  |
| ------ | ----------------------- | --------------------- | ------------------------- |
| POST   | `/auth/forgot-password` | `{ email }`           | `200 { requested: true }` |
| POST   | `/auth/reset-password`  | `{ token, password }` | `200 { reset: true }`     |

`forgot-password` responde sempre igual, exista ou não a conta, para não revelar quais e-mails estão
cadastrados. O token tem 32 bytes aleatórios, é guardado apenas como hash SHA-256, vale 30 minutos e
é de uso único; ao redefinir, todas as sessões abertas do usuário são encerradas.

### Open Finance e sincronização (exige autenticação JWT)

|| Método | Endpoint | Descrição | Resposta | |--------|----------|-----------|----------| | GET |
`/open-finance/connections` | Lista conexões de conta bancária do usuário | `200` | | POST |
`/open-finance/connections` | Conecta uma conta a um provedor | `201` | | PATCH |
`/open-finance/connections/:id/revoke` | Revoga (desconecta) uma conexão própria | `200` | | GET |
`/open-finance/consents` | Lista consentimentos do usuário | `200` | | POST |
`/open-finance/sync/own` | Dispara a reconciliação sob demanda ("Sincronizar agora") |
`200 { syncJob }` ou `429` se exceder o limite de frequência |

**Reconciliação diária:** job que compara o que o provedor informa com o que está salvo e corrige
lacunas — cria transações ausentes, atualiza campos do provedor (valor, data, tipo, descrição) e
recomputa o saldo da conta. É **idempotente**: usa o identificador original do provedor
(`providerId`, único no banco), então reexecutar não duplica lançamentos. O resultado de cada
execução é gravado em `sync_jobs` (status, início/término, erro se houver).

**Limite de frequência do botão:** por padrão, um usuário só pode disparar a sincronização manual
uma vez a cada 5 minutos (ajustável com `SYNC_RATE_LIMIT_MINUTES`). Jobs com falha não bloqueiam
nova tentativa, e a varredura diária automática não está sujeita ao limite.

### Open Finance / conexões com instituições (exige autenticação JWT)

|| Método | Endpoint | Descrição | Corpo | Resposta |
|--------|----------|-----------|-------|----------| | GET | `/open-finance/connections` | Lista
conexões do usuário logado | — | `200 ApiBankConnection[]` | | POST | `/open-finance/connections` |
Conecta instituição (sandbox) | `{ provider, providerAccountId, accountId }` |
`201 ApiBankConnection` | | PATCH | `/open-finance/connections/:id/revoke` | Revoga (desconecta) uma
conexão | — | `200 ApiBankConnection` | | POST | `/open-finance/sync` | Dispara job de
sincronização/reconciliação | — | `200 { id, status }` |

Status de conexão: `active`, `awaiting_authorization`, `expired`, `error`, `disconnected`.

Exemplo de conexão:

```json
{
  "id": "...",
  "provider": "sandbox",
  "providerAccountId": "acc-123",
  "status": "active",
  "consentId": null,
  "expiresAt": null,
  "account": { "id": "...", "name": "Conta principal" }
}
```

Tipos compartilhados adicionados em `packages/shared-types/src/index.ts`: `ApiBankConnection`,
`ConnectConnectionDto`, `BankConnectionStatus`, `SyncJob`, `TriggerSyncResponse`.

### Orçamentos (exige autenticação JWT)

| Método | Endpoint       | Descrição                                    | Corpo                                                 | Resposta                                  |
| ------ | -------------- | -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| GET    | `/budgets`     | Lista orçamentos com gasto e restante        | —                                                     | `200 ApiBudget[]`                         |
| POST   | `/budgets`     | Cria orçamento para uma categoria do usuário | `{ categoryId, amountCents, periodStart, periodEnd }` | `201 ApiBudget` (404 se categoria alheia) |
| PATCH  | `/budgets/:id` | Atualiza valor/período do próprio orçamento  | `{ amountCents?, periodStart?, periodEnd? }`          | `200 ApiBudget` ou `404`                  |
| DELETE | `/budgets/:id` | Remove o próprio orçamento                   | —                                                     | `200 { id }` ou `404`                     |

`amountCents` é inteiro em centavos (string). `spentCents` usa o módulo das despesas do período e
`remainingCents = amountCents - spentCents`.

### Categorias (exige autenticação JWT)

| Método | Endpoint          | Descrição                                    | Corpo                     | Resposta                   |
| ------ | ----------------- | -------------------------------------------- | ------------------------- | -------------------------- |
| GET    | `/categories`     | Lista categorias próprias e do sistema       | —                         | `200 ApiCategory[]`        |
| POST   | `/categories`     | Cria categoria do usuário                    | `{ name, color?, kind? }` | `201 ApiCategory`          |
| PATCH  | `/categories/:id` | Renomeia/recolore categoria própria          | `{ name?, color? }`       | `200 ApiCategory` ou `404` |
| DELETE | `/categories/:id` | Exclui categoria própria (do sistema: `404`) | —                         | `200 { id }` ou `404`      |

### Metas financeiras (exige autenticação JWT)

| Método | Endpoint               | Descrição                       | Corpo                                              | Resposta        |
| ------ | ---------------------- | ------------------------------- | -------------------------------------------------- | --------------- |
| GET    | `/financial-goals`     | Lista metas com progresso (0–1) | —                                                  | `200 ApiGoal[]` |
| POST   | `/financial-goals`     | Cria meta                       | `{ name, targetCents, currentCents?, dueDate? }`   | `201 ApiGoal`   |
| PATCH  | `/financial-goals/:id` | Atualiza meta própria           | `{ name?, targetCents?, currentCents?, dueDate? }` | `200` ou `404`  |
| DELETE | `/financial-goals/:id` | Remove meta própria             | —                                                  | `200 { id }`    |

Todas as rotas acima filtram por `userId` da sessão (`updateMany`/`deleteMany` com `where` composto)
e respondem `404` quando o recurso é de outro usuário — o mesmo comportamento de um recurso
inexistente, sem revelar sua existência.

### Saúde

|| Método | Endpoint | Descrição || ||--------|----------|-----------|| || GET | `/api/health` |
`200 { status: 'ok' }` (sem autenticação) ||

### Open Finance — sandbox (Fase 4)

Provedor isolado em adaptador dentro da API (não há container extra). Endpoints protegidos por JWT,
exceto o webhook.

|| Método | Endpoint | Descrição | Corpo | Resposta ||
||--------|----------|-----------|-------|----------|| || GET | `/open-finance/connections` | Lista
conexões do usuário logado | — | `200 BankConnection[]` || || POST | `/open-finance/connections` |
Vincula conta do provedor a uma conta local | `{ provider, providerAccountId, accountId }` |
`201 BankConnection` || || PATCH | `/open-finance/connections/:id/revoke` | Revoga (desconecta)
conexão própria | — | `200 BankConnection` || || GET | `/open-finance/consents` | Lista
consentimentos do usuário logado | — | `200 Consent[]` || || POST | `/open-finance/sync` | Dispara
job de sincronização sob demanda ("Sincronizar agora") | — | `201 { id, status: 'pending' }` || ||
POST | `/open-finance/webhooks/:provider` | Recebe webhooks de transação do provedor (sem
autenticação) | payload do provedor | `200 { received: true }` ||

- `OPEN_FINANCE_SANDBOX_BASE_URL` define a URL base do sandbox (variável em `.env.example`).
- Webhook é idempotente: `event_id` duplicado é ignorado (tabela `webhook_events`).
- Nunca guardar senha bancária; tokens do provedor ficam apenas no backend.

### Reconciliação (Fase 4)

|| Método | Endpoint | Descrição | Corpo | Resposta ||
||--------|----------|-----------|-------|----------|| || POST | `/open-finance/reconcile` | Executa
a rotina de reconciliação sob demanda (também rodada como job diário) | — |
`200 { reconciled: number, differences: number }` ||

Regras de reconciliação:

- Job diário compara o que o provedor informa com o que está salvo e corrige lacunas (transações
  ausentes, valores divergentes).
- Idempotência por identificador do provedor (`providerId` na transação) e `event_id` do webhook.
- Resultado registrado em `sync_jobs` (status `pending` / `completed` / `failed`).
- `POST /open-finance/sync` é o botão "Sincronizar agora", com limite de frequência.

## Tipos compartilhados

Contratos em `packages/shared-types/src/index.ts`: `ApiUser`, `ApiAccount`, `ApiTransaction`,
`ApiCategory`, `ApiBudget`, `ApiGoal`, `AuthResponse`, `RegisterDto`, `LoginDto`,
`CreateAccountDto`, `CreateTransactionDto`, `ApiErrorBody`, `LOCAL_STORAGE_KEYS`.

## Tratamento de erros no frontend

O cliente HTTP (`apps/web/src/lib/api.ts`) lança `ApiError` com:

- `status` (HTTP), `code`, `message`;
- flags `isUnauthorized` (401), `isForbidden` (403), `isNotFound` (404), `isClientError`,
  `isServerError`;
- leitura automática do bearer token do `localStorage` a cada requisição;
- `setUnauthorizedHandler` para reagir a 401 (o `AuthProvider` limpa `localStorage`, invalida o
  token e redireciona para `/login`).

## Validação de entrada (backend)

Todos os endpoints de criação usam DTOs com `class-validator` (`ValidationPipe` global). Corpo
inválido retorna `400` com a lista de campos (antes retornava `500` em body vazio).

## Variáveis de ambiente da API

`apps/api/.env.example`: `DATABASE_URL`, `DATABASE_POOLER_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
`PORT`, `NODE_ENV`, `FRONTEND_URL`, `LOG_LEVEL`.

## Variáveis do frontend

`apps/web/.env.example`: `NEXT_PUBLIC_API_BASE` (padrão `http://localhost:3001/api`).
