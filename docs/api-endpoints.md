# Documentação de Endpoints — API Meu Financeiro

Base URL: `http://localhost:3001/api` (desenvolvimento). Todo o prefixo é `/api`.
Autenticação: `Authorization: Bearer <JWT>` nos endpoints protegidos. JWT emitido em `/auth/login` e `/auth/register`.
Armazenamento no frontend: `localStorage` com chaves `mf_token` (token) e `mf_user` (usuário JSON).

## Convenções de resposta

Erros seguem o padrão do NestJS:

```json
{ "message": "...", "error": "...", "statusCode": 401 }
```

Códigos HTTP usados: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `500`.

## Endpoints

### Autenticação (público)

| Método | Endpoint | Descrição | Corpo da requisição | Resposta de sucesso |
|--------|----------|-----------|---------------------|---------------------|
| POST | `/auth/register` | Cadastra usuário | `{ email, name, password }` | `200 { user: ApiUser, token: string }` |
| POST | `/auth/login` | Autentica e emite JWT | `{ email, password }` | `200 { user: ApiUser, token: string }` |

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

| Método | Endpoint | Descrição | Corpo | Resposta |
|--------|----------|-----------|-------|----------|
| GET | `/accounts` | Lista contas do usuário logado | — | `200 ApiAccount[]` |
| POST | `/accounts` | Cria conta | `{ name, institution?, type?, currency? }` | `201 ApiAccount` |

Exemplo de conta:

```json
{ "id": "...", "name": "Conta Teste", "institution": "Banco X", "type": "checking", "currency": "BRL", "balanceCents": "0", "isActive": true, "createdAt": "...", "updatedAt": "..." }
```

Erros: `401` (não autenticado), `400` (body inválido).

### Transações (exige autenticação JWT)

| Método | Endpoint | Descrição | Corpo | Resposta |
|--------|----------|-----------|-------|----------|
| GET | `/transactions` | Listar transações do usuário | — | `200 ApiTransaction[]` |
| POST | `/transactions` | Criar lançamento | `{ accountId, description, amountCents, type, categoryId?, date }` | `201 ApiTransaction` |

Valores em centavos (string), negativos para despesa.

### Saúde

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/health` | `200 { status: 'ok' }` (sem autenticação) |

## Tipos compartilhados

Contratos em `packages/shared-types/src/index.ts`: `ApiUser`, `ApiAccount`, `ApiTransaction`, `ApiCategory`, `ApiBudget`, `ApiGoal`, `AuthResponse`, `RegisterDto`, `LoginDto`, `CreateAccountDto`, `CreateTransactionDto`, `ApiErrorBody`, `LOCAL_STORAGE_KEYS`.

## Tratamento de erros no frontend

O cliente HTTP (`apps/web/src/lib/api.ts`) lança `ApiError` com:
- `status` (HTTP), `code`, `message`;
- flags `isUnauthorized` (401), `isForbidden` (403), `isNotFound` (404), `isClientError`, `isServerError`;
- leitura automática do bearer token do `localStorage` a cada requisição;
- `setUnauthorizedHandler` para reagir a 401 (o `AuthProvider` limpa `localStorage`, invalida o token e redireciona para `/login`).

## Validação de entrada (backend)

Todos os endpoints de criação usam DTOs com `class-validator` (`ValidationPipe` global). Corpo inválido retorna `400` com a lista de campos (antes retornava `500` em body vazio).

## Variáveis de ambiente da API

`apps/api/.env.example`: `DATABASE_URL`, `DATABASE_POOLER_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `FRONTEND_URL`, `LOG_LEVEL`.

## Variáveis do frontend

`apps/web/.env.example`: `NEXT_PUBLIC_API_BASE` (padrão `http://localhost:3001/api`).
