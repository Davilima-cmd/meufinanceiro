# Documentação de Endpoints — API Meu Financeiro

Base URL: `http://localhost:3001/api` (desenvolvimento). Todo o prefixo é `/api`.

Autenticação em **duas formas**, aceitas em qualquer endpoint protegido:

1. **Cookie de sessão** (é o que a web usa). `POST /auth/login` devolve dois cookies:
   - `mf_session` — `HttpOnly`, `Secure` em produção, `SameSite=Lax`. Nunca é legível por JavaScript.
   - `mf_csrf` — legível, mesmo valor do header exigido nas escritas.
     Em `POST`/`PATCH`/`PUT`/`DELETE` é obrigatório enviar `X-CSRF-Token` igual ao cookie
     `mf_csrf`; sem isso a resposta é `403`.
2. **Bearer token** (`Authorization: Bearer <JWT>`) — para clientes que não são navegador (o app
   mobile). Quem usa Bearer não precisa de CSRF (não há cookie ambiente).

A web **não guarda mais o JWT** em `localStorage`: o token vive no cookie `HttpOnly`, e o
`localStorage` só tem `mf_user` e preferências. Sessão revogada no servidor deixa de valer
imediatamente (o JWT carrega o `sid` da sessão).

Documentação interativa: `GET /api/docs` (OpenAPI). Fica **desligada em produção** por padrão;
ligue com `ENABLE_API_DOCS=true`.

## Convenções de resposta

Erros seguem o padrão do NestJS:

```json
{ "message": "...", "error": "...", "statusCode": 401 }
```

Códigos HTTP usados: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `429`, `500`.

### Limite de requisições (`429`)

Toda a API tem limite global de **120 requisições por minuto por IP** (`RATE_LIMIT_PER_MINUTE`).
Endpoints sensíveis têm limites próprios, em janelas de 60 s:

| Endpoint                | Limite |
| ----------------------- | ------ |
| `POST /auth/register`   | 5      |
| `POST /auth/login`      | 10     |
| `POST /auth/forgot-password` | 3 |
| `POST /auth/reset-password`  | 10 |
| `POST /auth/mfa/verify` | 10     |

Exceder devolve `429` com `Retry-After`. É a defesa contra força bruta de senha e contra abuso do
envio de e-mail de recuperação.

## Endpoints

### Autenticação (público)

| Método | Endpoint         | Descrição                                                             | Corpo da requisição         | Resposta de sucesso                    |
| ------ | ---------------- | --------------------------------------------------------------------- | --------------------------- | -------------------------------------- |
| POST   | `/auth/register` | Cadastra usuário                                                      | `{ email, name, password }` | `200 { user: ApiUser, token: string }` |
| POST   | `/auth/login`    | Autentica e emite JWT                                                 | `{ email, password }`       | `200 { user: ApiUser, token: string }` |
| POST   | `/auth/logout`   | Revoga **esta** sessão (o cookie é apagado)                          | —                           | `200 { revoked: true }`                |
| POST   | `/auth/logout-all` | Revoga todas as sessões do usuário (todos os aparelhos)            | —                           | `200 { revoked: n }`                   |
| GET    | `/auth/status`   | Diz se a sessão atual ainda vale, e lista as sessões abertas         | —                           | `200 AuthStatus`                       |
| DELETE | `/auth/account`  | Exclui a conta do usuário logado e todos os dados relacionados (LGPD) | —                           | `204` sem conteúdo                     |

`GET /auth/status` responde
`{ authenticated: boolean, user: ApiUser | null, sessionId: string | null, sessions: [{ id, createdAt, userAgent, revokedAt }] }`.
Ele existe para a web confirmar, ao abrir o painel, que a sessão guardada no navegador não foi
revogada em outro aparelho (logout, troca de senha, `logout-all`).

Exemplo de resposta:

```json
{
  "user": { "id": "...", "email": "...", "name": "...", "createdAt": "...", "updatedAt": "..." },
  "token": "eyJ..."
}
```

Erros esperados:

- `400` — corpo inválido (ex: e-mail mal formado, senha curta).
- `401` — credenciais inválidas, ou sessão encerrada (`Sessão encerrada. Entre novamente.`).
- `429` — limite de tentativas de login excedido.
- `409` — e-mail já cadastrado.

### Contas (exige autenticação JWT)

| Método | Endpoint         | Descrição                      | Corpo                                                     | Resposta           |
| ------ | ---------------- | ------------------------------ | --------------------------------------------------------- | ------------------ |
| Método | Endpoint         | Descrição                      | Corpo                                                     | Resposta           |
| ------ | ---------------- | ------------------------------ | -------------------------------------------------         | ------------------ |
| GET    | `/accounts`      | Lista contas do usuário logado | —                                                         | `200 ApiAccount[]` |
| POST   | `/accounts`      | Cria conta                     | `{ name, institution?, type?, currency?, balanceCents? }` | `201 ApiAccount`   |
| PATCH  | `/accounts/:id`  | Edita ou arquiva a conta       | `{ name?, institution?, type?, isActive? }`               | `200 ApiAccount`   |
| DELETE | `/accounts/:id`  | Exclui a conta (soft delete)   | —                                                         | `200 { deleted }`  |

O `GET /accounts` devolve as contas **próprias e as compartilhadas com o usuário**. Cada item traz
`ownerId`, `ownerName`, `shareLevel` (`private` | `BALANCE_ONLY` | `FULL`) e `access`
(`{ canSeeBalance, canSeeTransactions, readOnly }`). Conta de outra pessoa vem sempre `readOnly`.

O `balanceCents` do `POST` é o **saldo inicial**: é gravado como um lançamento "Saldo inicial", de
modo que o saldo continue sendo derivado do histórico.

`DELETE /accounts/:id` é **soft delete** e sempre funciona, mesmo com histórico (requisito 23 da
especificação: não apagar registro financeiro sem rastro). Numa única transação:

- a conta recebe `deletedAt` e `isActive: false`;
- todos os lançamentos dela recebem `deletedAt` (saem de somas, relatórios e da sincronização);
- os compartilhamentos da conta são revogados (`revokedAt`);
- se a conta for sincronizada com um provedor, a sincronização **não** recria os lançamentos
  apagados pelo usuário.

Nenhuma leitura posterior devolve linhas com `deletedAt`: listagens, visibilidade compartilhada,
orçamentos, saldos e idempotência da sincronização filtram por `deletedAt: null`.

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

| Método | Endpoint                    | Descrição                                            | Corpo                                                                                    | Resposta               |
| ------ | --------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| GET    | `/transactions`             | Listar transações do usuário                         | —                                                                                        | `200 ApiTransaction[]` |
| POST   | `/transactions`             | Criar lançamento                                     | `{ accountId, description, amountCents, type, categoryId?, transferAccountId?, date }`   | `201 ApiTransaction`   |
| POST   | `/transactions/:id/reverse` | Estorna criando o lançamento inverso                 | —                                                                                        | `201 ApiTransaction`   |
| PATCH  | `/transactions/:id`         | Edita valor, descrição, categoria, datas e status    | `{ description?, amountCents?, categoryId?, date?, competenceDate?, dueDate?, status? }` | `200 ApiTransaction`   |
| DELETE | `/transactions/:id`         | Exclui (soft delete) — ou o par inteiro, numa transferência | —                                                                                  | `200 { deleted }`      |
| POST   | `/transactions/:id/settle`  | Liquida um pendente e aplica o valor ao saldo        | `{ paidAt? }`                                                                            | `200 ApiTransaction`   |
| POST   | `/transactions/:id/cancel`  | Cancela um pendente sem mexer no saldo               | —                                                                                        | `200 ApiTransaction`   |

Valores em centavos (string), negativos para despesa e positivos para receita — o servidor recusa
(`400`) despesa positiva, receita negativa e valor zero.

Regras de integridade aplicadas no servidor:

- criar, estornar ou excluir um lançamento ajusta `balanceCents` da conta dentro de uma transação de
  banco, pelo mesmo delta gravado no histórico;
- `type: "transfer"` exige `transferAccountId` (diferente da origem) e cria duas pontas com o mesmo
  `transferId`, uma negativa na origem e outra positiva no destino; transferência nunca conta como
  receita nem despesa;
- excluir uma das pontas remove o par inteiro (soft delete das duas: `deletedAt`, com o valor
  devolvido ao saldo);
- excluir lançamento compartilhado é recusado: conta de outra pessoa é somente leitura (`403`);
- `categoryId` precisa ser do usuário ou uma categoria do sistema (`isSystem`);
- só lançamento `paid` mexe no saldo: `pending` é conta a pagar/receber (entra na projeção, não no
  caixa), `canceled` não acontece. Liquidar aplica o valor, cancelar um pendente não aplica nada;
- `GET /transactions?status=pending|paid|canceled&overdue=true` filtra a lista;
- a lista traz os lançamentos do usuário **e os das contas compartilhadas em `FULL`** (com
  `account.user`), sempre somente leitura.

### Compartilhamento entre o casal (exige autenticação JWT)

Duas camadas: primeiro a **parceria** (duas pessoas conectadas), depois o **nível por conta**.

| Método | Endpoint                | Descrição                                        | Corpo       | Resposta                                |
| ------ | ----------------------- | ------------------------------------------------ | ----------- | --------------------------------------- |
| GET    | `/sharing`              | Parceria, parceiro e nível de cada conta própria | —           | `200 ApiSharingOverview`                |
| GET    | `/sharing/accounts`     | Contas que o parceiro compartilhou com o usuário | —           | `200 ApiSharedAccount[]`                |
| POST   | `/sharing/invite`       | Convida um usuário já cadastrado, pelo e-mail    | `{ email }` | `201 ApiPartnership`                    |
| POST   | `/sharing/accept`       | Aceita um convite recebido                       | `{ partnershipId? }` | `200 ApiPartnership`                    |
| DELETE | `/sharing`              | Desfaz a parceria e revoga os compartilhamentos  | —           | `200 { revoked: true }`                 |
| PATCH  | `/sharing/accounts/:id` | Define o nível de uma conta do próprio usuário   | `{ level }` | `200 AccountShare \| { revoked: true }` |

Níveis:

- `private` — padrão de toda conta nova. **Não é gravado**: significa "sem `account_shares` ativo"
  (nenhuma linha ou `revokedAt` preenchido). `PATCH` com `private` revoga o compartilhamento.
- `BALANCE_ONLY` — o parceiro vê o saldo, nunca os lançamentos.
- `FULL` — o parceiro vê saldo e histórico. Ainda assim é **somente leitura**.

Regras:

- compartilhar exige parceria `accepted` (`400` caso contrário); o convite fica `pending` até o
  outro aceitar e só quem foi convidado pode aceitar;
- `GET /sharing` traz `invites: [{ id, from: { id, name } }]` com os convites recebidos e ainda
  pendentes; `POST /sharing/accept` aceita o convite mais recente ou o indicado em
  `{ partnershipId }` (útil quando há mais de um);
- convidar e-mail sem conta responde `404`, convidar a si mesmo `400`, e um novo convite para quem
  já é parceiro `400`; reconvidar quem recusou recoloca o pedido como `pending`;
- só o dono muda o nível da própria conta — conta de outra pessoa responde `404` (não `403`, para
  não revelar que ela existe);
- escrita nunca é delegada: criar, editar, liquidar, cancelar, estornar, excluir e transferir em
  conta compartilhada respondem `403` com "Conta compartilhada é somente leitura…". Transferência só
  entre contas do próprio usuário;
- `DELETE /sharing` revoga a parceria e todos os compartilhamentos dos dois lados numa transação de
  banco; o resumo do parceiro expõe apenas `{ id, name }`, nunca o e-mail.

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

Tipos compartilhados adicionados em `packages/shared-types/src/index.ts`: `ShareLevel`,
`AccountAccess`, `ApiPartnership`, `ApiSharingOverview`, `ApiSharedAccount`, `ApiBankConnection`,
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
| GET    | `/financial-goals/:id/contributions` | Histórico de aportes (mais recente primeiro) | — | `200 ApiGoalContribution[]` |
| POST   | `/financial-goals/:id/contributions` | Registra aporte (negativo = resgate) e soma no saldo | `{ amountCents, note?, occurredAt? }` | `200 ApiGoal` |
| DELETE | `/financial-goals/:id/contributions/:contributionId` | Remove aporte e devolve o valor ao saldo | — | `200 ApiGoal` |
| DELETE | `/financial-goals/:id` | Remove meta própria             | —                                                  | `200 { id }`    |

O saldo da meta (`currentCents`) é a soma dos aportes. Ajustar `currentCents` direto pelo `PATCH`
continua permitido, mas **entra no histórico** como aporte de ajuste — sem isso o número deixaria
de ter explicação. Remover um aporte errado devolve o valor ao saldo: nada de correção por
edição destrutiva.

Todas as rotas acima filtram por `userId` da sessão (`updateMany`/`deleteMany` com `where` composto)
e respondem `404` quando o recurso é de outro usuário — o mesmo comportamento de um recurso
inexistente, sem revelar sua existência.

### Rateio entre o casal (exige autenticação JWT)

Divisão de um lançamento entre as duas pessoas, com soma **exatamente** igual ao valor (o resto de
centavos é distribuído, nunca perdido).

| Método | Endpoint                                | Descrição                                        | Corpo                                                    | Resposta            |
| ------ | --------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- | ------------------- |
| GET    | `/allocations/transactions/:id`         | Partes do rateio de um lançamento                | —                                                        | `200 Allocation[]`  |
| PUT    | `/allocations/transactions/:id`         | Cria/refaz o rateio (substitui as partes)        | `{ participants: string[], mode?, weights? }`             | `200 Allocation[]`  |
| POST   | `/allocations/transactions/:id/settle`  | Marca a parte de um participante como acertada   | `{ participantId }`                                       | `200 Allocation[]`  |
| GET    | `/allocations/summary?from&to`          | Quanto cada pessoa deve no período               | —                                                        | `200 { parts }`     |

Regras:

- só o **dono do lançamento** cria, refaz e acerta o rateio — rateio de lançamento alheio responde
  `404`;
- participante só pode ser o próprio dono ou o parceiro com parceria `accepted` (`400` caso
  contrário) — não existe rateio com terceiro;
- `mode: "equal"` (padrão) divide igualmente; `mode: "proportional"` exige `weights` por
  participante (percentual ou valor);
- em ambos os modos a soma das partes fecha com o valor do lançamento. Em 100,00 para 3 pessoas dá
  `3334 + 3333 + 3333`, e não `3333 × 3`;
- `settle` é idempotente por parte: acertar duas vezes responde `404` na segunda;
- `summary` devolve, por pessoa, `totalCents`, `settledCents` e `openCents`.

### Lançamentos recorrentes (exige autenticação JWT)

| Método | Endpoint            | Descrição                                   | Corpo                                                                 | Resposta              |
| ------ | ------------------- | ------------------------------------------- | --------------------------------------------------------------------- | --------------------- |
| GET    | `/recurrences`      | Lista os modelos de recorrência do usuário  | —                                                                     | `200 Recurrence[]`    |
| POST   | `/recurrences`      | Cria a regra (ex.: todo dia 5, aluguel)     | `{ accountId, description, amountCents, type, categoryId?, dayOfMonth?, startAt? }` | `201 Recurrence` |
| PATCH  | `/recurrences/:id`  | Pausa/retoma (`{ active }`)                 | `{ active }`                                                          | `200 { id, active }`  |
| DELETE | `/recurrences/:id`  | Remove a regra (os lançamentos já gerados ficam) | —                                                                | `200 { deleted }`     |
| POST   | `/recurrences/run`  | Gera agora os lançamentos vencidos          | —                                                                     | `200 { created }`     |

O modelo **não** é o lançamento: ele descreve a regra. A geração é idempotente por `nextRunAt`
(avança na mesma transação que cria o lançamento), então rodar duas vezes no mesmo dia não duplica
nada. O lançamento gerado nasce `status: "pending"` e `origin: "recurring"`: aluguel do mês que vem
é conta a pagar, não dinheiro que saiu do caixa. O dia é limitado a 28 para não "vazar" em fevereiro.

### Patrimônio (exige autenticação JWT)

| Método | Endpoint                | Descrição                                              | Corpo                                    | Resposta             |
| ------ | ----------------------- | ------------------------------------------------------ | ---------------------------------------- | -------------------- |
| GET    | `/net-worth`            | Patrimônio: contas + bens − dívidas, e os itens        | —                                        | `200 ApiNetWorthSummary` |
| POST   | `/net-worth/items`      | Declara um bem ou uma dívida                           | `{ name, kind: 'asset'\|'liability', valueCents, note? }` | `201 ApiNetWorthItem` |
| PATCH  | `/net-worth/items/:id`  | Corrige nome, tipo, valor ou observação                | `{ name?, kind?, valueCents?, note? }`    | `200 { id, updated }` |
| DELETE | `/net-worth/items/:id`  | Remove o item                                          | —                                        | `200 { deleted }`    |

`valueCents` é **sempre positivo**: o sinal vem do `kind`. Valor negativo inverteria a dívida em
bem e esconderia passivo — o servidor recusa com `400`. O resumo devolve `accountsTotalCents`,
`assetsCents`, `liabilitiesCents` e `netCents` separados, porque mostrar só o ativo é o que faz o
painel mentir para quem tem financiamento.

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
`CreateAccountDto`, `CreateTransactionDto`, `ApiErrorBody`, `LOCAL_STORAGE_KEYS`,
`AuthStatus`, `ApiGoalContribution`, `ApiNetWorthItem`, `ApiNetWorthSummary`.

## Documentação viva (OpenAPI)

`GET /api/docs` serve o Swagger UI e `GET /api/docs-json` o documento OpenAPI. Em produção fica
desligado por padrão (`ENABLE_API_DOCS=true` para ligar): num app financeiro, publicar o mapa
completo dos endpoints é entregar superfície de ataque de graça.

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
`PORT`, `NODE_ENV`, `FRONTEND_URL`, `LOG_LEVEL`, e as opcionais:

| Variável                  | Efeito                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| `RATE_LIMIT_PER_MINUTE`   | Limite global por IP (padrão `120`)                                 |
| `ENABLE_API_DOCS`         | `true` liga `/api/docs` em produção (padrão: desligado)             |
| `SENTRY_DSN`              | Liga o envio de erros ao Sentry; sem ela, nada é enviado            |
| `SENTRY_ENVIRONMENT`      | Ambiente no Sentry (padrão `NODE_ENV`)                              |
| `SENTRY_TRACES_SAMPLE_RATE` | Amostragem de tracing (padrão `0.05`)                             |
| `SYNC_RATE_LIMIT_MINUTES` | Intervalo mínimo entre sincronizações manuais (padrão `5`)          |

## Variáveis do frontend

`apps/web/.env.example`: `NEXT_PUBLIC_API_BASE` (padrão `http://localhost:3001/api`).

`apps/mobile`: `EXPO_PUBLIC_API_URL` — sem ela o app fica em modo demonstração (dados fictícios,
sem rede). Com ela, o app autentica com Bearer token e mostra dados reais.
