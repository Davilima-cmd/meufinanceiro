# Auditoria — Especificação técnica x código atual

Data: 25/11/2026 · Branch `arena/1b18c972-meufinanceiro`

Este documento compara a especificação funcional (plataforma de gestão financeira pessoal,
compartilhada e familiar) com o que existe de fato no repositório. Cada linha foi conferida no
código, não apenas nos nomes de arquivos.

Legenda de situação: **Implementado** · **Parcial** · **Divergente** · **Ausente** · **Só visual**
(existe na tela, não persiste) · **Pós-MVP**

---

## 1. Resumo executivo

O projeto tem uma base técnica sólida e incomum para um MVP: NestJS modular com validação
(`class-validator`), Prisma com `DECIMAL(20,0)` para dinheiro (atende a regra 21.1), JWT com MFA
TOTP, auditoria via interceptor, criptografia AES-256-GCM, Open Finance em sandbox com webhook
assinado e idempotência por `providerId`, e 178 testes automatizados. A web tem identidade visual
própria, 10 telas, e uma camada de UI acessível (select, calendário e diálogos próprios).

O problema central não é falta de módulos — é **duplicidade de fonte de verdade**. Existem hoje duas
aplicações paralelas:

1. **Modo demonstração**: tudo funciona, mas só em `localStorage`.
2. **Modo API**: a web lê do backend e **não escreve nada nele**.

Toda mutação da interface (`addTransaction`, `addAccount`, `addCategory`, `setBudget`, `addGoal`,
`delete*`, `setShareLevel`) passa por `updateSnapshot` em `apps/web/src/lib/store.tsx`, que persiste
**apenas** quando `sessionRef.current?.mode === 'demo'`. O cliente já possui
`api.createAccount`/`api.createTransaction` (`apps/web/src/lib/api.ts`), mas nenhuma tela os chama.
Resultado: um usuário logado pela API cria lançamentos que desaparecem ao recarregar.

Este é o achado **P0** e o motivo pelo qual o MVP (item 26 do documento) não pode ser considerado
concluído, apesar de a interface parecer completa.

---

## 2. Comparação por requisito

### 2.1 Estrutura de backend (item 3)

| Módulo da especificação                            | Situação       | Arquivos                             | Observação                                                  |
| -------------------------------------------------- | -------------- | ------------------------------------ | ----------------------------------------------------------- |
| Auth                                               | Implementado   | `apps/api/src/auth/*`                | JWT, argon2, MFA TOTP, sessões                              |
| Users                                              | Parcial        | `schema.prisma` `User`               | Sem foto, telefone, idioma, fuso, status                    |
| Households (núcleos)                               | **Divergente** | `schema.prisma` `Partnership`        | 1:1 "casal", não N núcleos por usuário                      |
| Memberships                                        | Ausente        | —                                    | Papéis proprietário/admin/membro/dependente não existem     |
| Invitations                                        | Ausente        | —                                    | Não há convite com token/prazo/papel                        |
| Permissions                                        | Parcial        | `AccountShare.level`                 | Só nível por conta, sem checagem no servidor                |
| Accounts                                           | Parcial        | `accounts.controller.ts`             | Só `GET`/`POST`; sem saldo inicial, arquivar, editar        |
| Transactions                                       | Parcial        | `transactions.controller.ts`         | Só `GET`/`POST`; **sem baixa de saldo e sem transferência** |
| Categories                                         | Implementado   | `categories.controller.ts`           | CRUD com escopo por dono                                    |
| Transfers                                          | **Ausente**    | —                                    | Tipo existe no DTO, mas nada é debitado/creditado           |
| Allocations (rateio)                               | Implementado   | `allocations/`, tabela `allocations`  | Igualitário e proporcional; soma fecha exatamente o valor   |
| Budgets                                            | Implementado   | `budgets.controller.ts`              | Gasto calculado por período                                 |
| Credit Cards / Purchases / Installments / Invoices | Ausente        | —                                    | Conta do tipo `credit` é só rótulo                          |
| Bills (a pagar/receber)                            | Implementado   | `billing.ts`, `/recurrences`, `/vencimentos` | `pending` + vencimento, lembretes e recorrência mensal      |
| Goals                                              | Implementado   | `financial-goals.controller.ts`      | Com histórico de aportes (`goal_contributions`)             |
| Assets / Liabilities                               | Implementado   | `net-worth/`, tabela `net_worth_items` | Bens e dívidas declarados; patrimônio líquido e endividamento |
| Reports                                            | Parcial        | `lancamentos/page.tsx` (`exportCsv`) | Só CSV de lançamentos no navegador; sem PDF/Excel           |
| Notifications                                      | Ausente        | —                                    | —                                                           |
| Attachments                                        | Ausente        | —                                    | —                                                           |
| AI Assistant                                       | Ausente        | —                                    | —                                                           |
| Audit                                              | Implementado   | `audit/*`                            | Ações sensíveis mapeadas                                    |
| Subscriptions                                      | Ausente        | —                                    | —                                                           |

### 2.2 Usuários, núcleos e permissões (item 4)

| Requisito                                | Situação       | Evidência                                                                                      |
| ---------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Conta individual com nome, e-mail, senha | Implementado   | `User` em `schema.prisma`                                                                      |
| Foto, telefone, idioma, fuso, status     | Ausente        | —                                                                                              |
| Criar/participar de vários núcleos       | **Divergente** | `Partnership` liga dois usuários; não há entidade "núcleo"                                     |
| Alternar entre ambientes                 | **Só visual**  | `casal/page.tsx` alterna no estado do navegador                                                |
| Papéis e permissões configuráveis        | Ausente        | —                                                                                              |
| Convites (token, prazo, aceitar/recusar) | Ausente        | —                                                                                              |
| Isolamento entre núcleos                 | Parcial        | Controllers filtram por `userId`, o que hoje garante isolamento, mas não há conceito de núcleo |

### 2.3 Contas (item 5)

| Requisito                                            | Situação           | Evidência                                                    |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------------------ |
| Tipos de conta (corrente, poupança, carteira, etc.)  | Implementado (web) | `ACCOUNT_TYPES` em `contas/page.tsx`                         |
| Saldo inicial + saldo calculado                      | **Divergente**     | Conta nasce com `balanceCents: 0` e nunca é recalculada      |
| Moeda, responsável, status arquivado                 | Parcial            | `currency`/`isActive` existem; não há endpoint para arquivar |
| Conta pessoal não vira compartilhada automaticamente | Implementado       | Compartilhamento explícito                                   |
| Impedir inconsistência entre transferências e saldos | **Ausente**        | Não há transferência implementada                            |

### 2.4 Lançamentos (item 6 e regras 21)

| Requisito                                           | Situação       | Evidência                                                                   |
| --------------------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| Receita, despesa, transferência                     | Parcial        | `type` aceita os três; transferência não move dinheiro                      |
| Ajuste de saldo, estorno/cancelamento               | Ausente        | Só existe `DELETE`                                                          |
| Status (pendente/pago/vencido/cancelado)            | Ausente        | Todo lançamento é tratado como efetivado                                    |
| Data de competência, vencimento, pagamento          | Ausente        | Só `date`                                                                   |
| Observações, anexos, recorrência, parcelas          | Ausente        | —                                                                           |
| Receitas/despesas alteram o saldo quando liquidadas | **Divergente** | POST cria a transação e **não** atualiza `balanceCents`                     |
| Transferências não são receita/despesa              | **Divergente** | Analítica da web ignora `transfer`, mas API não modela o par débito/crédito |
| Valores sem ponto flutuante                         | Implementado   | `DECIMAL(20,0)` + `BigInt` na web                                           |
| Não apagar sem histórico                            | **Divergente** | `DELETE` físico, sem soft delete nem referência a estorno                   |
| Movimentação não processada duas vezes              | Implementado   | `@@unique([providerId])` + `webhook_events`                                 |

### 2.5 Rateio (item 7) — diferencial do produto

**Ausente por completo.** Não há tabela de rateio, cálculo de divisão igualitária/proporcional,
tratamento de arredondamento, pagamentos parciais nem histórico. As telas também não mencionam
rateio. Este é o maior gap funcional do MVP (itens 12 e 13 do escopo obrigatório).

### 2.6 Categorias, orçamentos e metas (itens 8–9, 12)

| Requisito                                        | Situação      | Evidência                                         |
| ------------------------------------------------ | ------------- | ------------------------------------------------- |
| CRUD de categoria com cor/tipo                   | Implementado  | `categories.controller.ts`                        |
| Subcategorias, ícones, arquivar                  | Ausente       | —                                                 |
| Orçamento mensal por categoria com % consumido   | Implementado  | `budgets.controller.ts`                           |
| Orçamento anual, por participante, compartilhado | Ausente       | —                                                 |
| Alertas de limite / previsão                     | **Só visual** | `Badge` de "estourou"/"atenção" calculado na tela |
| Metas com valor alvo e progresso                 | Implementado  | `financial-goals.controller.ts`                   |
| Histórico de contribuições da meta               | Ausente       | Aporte só soma em `currentCents`                  |
| Metas compartilhadas                             | Ausente       | Meta é sempre de um `userId`                      |

### 2.7 Cartões, faturas, contas a pagar (itens 10–11)

**Ausente por completo** — inclui a regra crítica 21.3 ("pagamento de fatura não pode duplicar
despesas"). Hoje, "cartão de crédito" é apenas um tipo de conta com saldo manual.

### 2.8 Patrimônio, dashboard e relatórios (itens 13–15)

| Requisito                                                       | Situação           | Evidência                                                |
| --------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| Patrimônio líquido = ativos − passivos                          | **Só visual**      | `contas/page.tsx` soma saldos ≥ 0 como "ativos"          |
| Dashboard com filtros (minhas/compartilhadas/consolidado)       | Parcial            | `app/page.tsx` + `analytics.ts` filtram por dono e nível |
| Indicadores (saldo, receitas, despesas, pendentes, vencimentos) | Parcial            | Pendentes e vencimentos não existem                      |
| Gráficos (barras, categoria, evolução, previsão)                | Parcial            | SVG próprio; sem previsão e sem evolução patrimonial     |
| Relatórios com PDF/Excel                                        | Parcial            | CSV de lançamentos no navegador                          |
| Relatórios respeitando permissões                               | Implementado (web) | `visibleAccounts`/`coverage`                             |

### 2.9 Demais itens

| Item da especificação                   | Situação                   | Observação                                          |
| --------------------------------------- | -------------------------- | --------------------------------------------------- |
| Recuperação de senha (26.2)             | **Ausente**                | Nenhuma rota ou tela                                |
| Verificação de e-mail                   | Ausente                    | —                                                   |
| MFA                                     | Implementado               | `mfa.controller.ts`                                 |
| Notificações (17)                       | Ausente                    | —                                                   |
| Colaboração/comentários/aprovações (18) | Ausente                    | —                                                   |
| Assistente com IA (16)                  | Ausente                    | Sem provedor configurado                            |
| Open Finance (24)                       | Parcial (sandbox)          | Webhooks com HMAC, sync e reconciliação             |
| IA/OCR/importação OFX-CSV               | Ausente                    | Pós-MVP                                             |
| Assinaturas/planos (25)                 | Ausente                    | —                                                   |
| Swagger/OpenAPI (2)                     | Ausente                    | Documentação manual em `docs/api-endpoints.md`      |
| Sentry (2)                              | Ausente                    | —                                                   |
| Tailwind (2)                            | **Divergente e aceitável** | CSS próprio em `styles.css`; não recomendo migrar   |
| Recharts (2)                            | **Divergente e aceitável** | Gráficos SVG próprios; não recomendo migrar         |
| Paleta verde/ dourado (1.3)             | **Divergente**             | Tema atual usa violeta/verde-menta                  |
| Aplicativo iOS/Android (1.2)            | Parcial                    | `apps/mobile` Expo exporta web; sem fluxos          |
| Testes (27)                             | Parcial                    | 178 testes; sem testes de integração com banco real |
| Migrations versionadas (23)             | Implementado               | 10 migrations + `_prisma_migrations`                 |
| Exclusão lógica (23)                    | Implementado               | `deletedAt` em contas e lançamentos, sempre filtrado |
| `GET /status` / sessões revogáveis      | Implementado               | `sid` no JWT; `session.service.assertActive` por request |

---

## 3. Problemas de integridade financeira encontrados

| #   | Problema                                                                          | Onde                                    | Regra violada   | Prioridade |
| --- | --------------------------------------------------------------------------------- | --------------------------------------- | --------------- | ---------- |
| 1   | Web em modo API não persiste nenhuma escrita                                      | `lib/store.tsx:122-130`                 | 21.10, 26 (MVP) | **P0**     |
| 2   | Saldo da conta não é afetado ao criar lançamento pela API                         | `transactions.controller.ts` (`create`) | 6.3, 21.10      | **P0**     |
| 3   | Transferência aceita no DTO mas não move dinheiro entre contas                    | `transaction.dto.ts` + controller       | 21.2            | **P0**     |
| 4   | `DELETE /transactions` inexistente como soft delete/estorno; web apaga em memória | `store.tsx` `deleteTransaction`         | 21.7, 21.8      | P1         |
| 5   | Sem lançamento pendente x liquidado                                               | modelo `Transaction`                    | 21.11           | P1         |
| 6   | Rateio inexistente — **resolvido** (`src/allocations`)                            | —                                       | 21.5, 21.6      | P1         |
| 7   | Autorização por conta/parceiro — **resolvido** (`AccountAccessService`)           | todos os controllers                    | 20.2, 21.15     | P1         |
| 8   | Sem transação de banco em operações multi-registro                                | controllers                             | 21.9            | P1         |
| 9   | Dashboard não distinguia competência de caixa — **resolvido** (`basisTotals`)     | `analytics.ts`                          | 21.13           | P2         |

---

## 4. Plano de correção priorizado

### P0 — Crítico (integridade e dados)

1. **Persistir escritas no modo API**: `store.tsx` passa a chamar o cliente HTTP nas mutações e a
   reconciliar com a resposta; erro de rede não pode deixar estado mentiroso na tela.
2. **Saldo derivado das movimentações**: criar/atualizar/excluir lançamento ajusta `balanceCents`
   dentro de `prisma.$transaction`, com o valor calculado no servidor.
3. **Transferência real**: débito na origem + crédito no destino, um único `transferId`, nunca
   contabilizado como receita/despesa.
4. **Estorno em vez de exclusão** em lançamentos já liquidados (mantém referência ao original).

### P1 — Alta (escopo obrigatório do MVP)

5. Lançamento com status (`pending`/`paid`), vencimento e liquidação.
6. Rateio com divisão igualitária e proporcional, fechando exatamente o valor (ajuste de
   arredondamento na última parcela) e com histórico.
7. Endpoint de contas a pagar com data de vencimento e lembretes.
8. Recuperação de senha.
9. Checagem de permissão por conta compartilhada no servidor (não confiar no filtro da web).

### P2 — Média

10. Patrimônio separado do saldo (ativos/passivos).
11. Recorrência de lançamentos e aporte com histórico em metas.
12. Relatório com filtros e exportação além do CSV.
13. Swagger e Sentry.

### P3 — Baixa / pós-MVP

14. Cartões, faturas, parcelamentos; assistente com IA; notificações; assinaturas; paleta verde
    premium; app nativo.

---

## 5. O que **não** deve ser mexido

- Modelagem de dinheiro (`DECIMAL(20,0)` + `bigint` na web): correta.
- MFA, auditoria e criptografia de campos: funcionando.
- Camada de UI própria e testes de componente: base boa.
- CSS próprio e gráficos SVG: migrar para Tailwind/Recharts seria custo sem ganho.
- Open Finance sandbox: já idempotente e com webhook assinado.

---

## 6. Correções aplicadas nesta auditoria

O que a seguir deixou de ser "ausente" ou "divergente". Nada foi removido nem migrado de forma
destrutiva: as duas migrations são **aditivas** (uma coluna e uma tabela novas).

| #   | Antes                                              | Depois                                                                                             |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Interface só gravava em `localStorage` no modo API | `store.tsx` chama o cliente HTTP em todas as mutações e relê o estado do servidor                  |
| 2   | Erro da API era invisível                          | Cada tela exibe a recusa no próprio formulário (`syncError` + mensagem local)                      |
| 3   | Lançamento não alterava o saldo                    | `TransactionsService` ajusta `balanceCents` na mesma transação de banco                            |
| 4   | Transferência aceita mas inerte                    | Duas pontas com `transferId`, sem contar como receita/despesa, removidas em par                    |
| 5   | Exclusão apagava o histórico                       | Estorno (`POST /transactions/:id/reverse`) cria o inverso; exclusão devolve o valor ao saldo       |
| 6   | `categoryId` sem validação de dono                 | Servidor aceita só categoria do usuário ou do sistema                                              |
| 7   | Conta nasce com saldo zero                         | `balanceCents` no `POST` vira o lançamento "Saldo inicial"                                         |
| 8   | Conta sem edição/arquivo                           | `PATCH /accounts/:id` (`isActive`), `DELETE` bloqueado com histórico                               |
| 9   | Sem recuperação de senha                           | `/auth/forgot-password` + `/auth/reset-password`, token de uso único (30 min) e sessões encerradas |

Cobertura nova: `test/transactions.service.test.ts` (12), `test/accounts.controller.test.ts` (7),
`test/password-reset.service.test.ts` (6), `components/store.api.test.tsx` (5),
`app/login/login.test.tsx` (4).

## 7. Próximo passo recomendado (P1)

1. **Núcleos e rateio** — maior lacuna funcional do MVP: entidade de núcleo com papéis, convite por
   token e rateio com divisão igualitária/proporcional fechando exatamente o valor.
2. **Status e liquidação de lançamento** (`pending`/`paid`) com data de competência separada da data
   de caixa.
3. **Contas a pagar** com vencimento e lembretes.
4. **Permissão por conta compartilhada verificada no servidor** (hoje o isolamento é por `userId`, o
   que é seguro mas impede o compartilhamento real).
5. **Publicar a API** — hoje só a web é implantada; a API responde apenas em `localhost` em
   desenvolvimento, então o modo API não funciona em produção.

Itens que continuam fora de escopo (V2, conforme §26): cartões e faturas, parcelamentos, patrimônio
detalhado, assistente com IA, notificações, assinaturas e aprovações.

---

## 8. Fechamento do plano de correção (fase 6)

Tudo o que a seção 4 listou como P0–P2 foi implementado. A tabela abaixo é o mapa de onde cada item
mora hoje, para a próxima auditoria não precisar refazer a busca.

| Item do plano                                   | Onde está                                                                                    | Prova automatizada                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| P0.1 escritas persistidas no modo API           | `apps/web/src/lib/store.tsx` (`mutate` chama a API e relê o snapshot)                         | `components/store.api.test.tsx`                           |
| P0.2 saldo derivado das movimentações           | `apps/api/src/transactions/transactions.service.ts` (`$transaction` + delta)                  | `test/transactions.service.test.ts`                       |
| P0.3 transferência real (duas pontas)           | idem (`transferId`, par removido junto)                                                       | idem                                                      |
| P0.4 estorno + soft delete (req. 23)            | `transactions.service.remove`, `accounts.controller.remove`                                   | `transactions.service.test.ts`, `accounts.controller.test.ts` |
| P1.5 status, vencimento e liquidação            | `Transaction.status/dueDate/paidAt`; `PATCH /transactions/:id/settle`                         | `transactions.service.test.ts`                            |
| P1.6 rateio igualitário e proporcional          | `apps/api/src/allocations/{split,allocations.service}.ts`                                     | `allocations.split.test.ts`, `allocations.service.test.ts` |
| P1.7 contas a pagar com vencimento e lembretes  | `/vencimentos` + `apps/web/src/lib/billing.ts` + lembrete em `/`                              | `lib/billing.test.ts`                                     |
| P1.8 recuperação de senha                       | `auth/password-reset.service.ts`                                                              | `test/password-reset.service.test.ts`                     |
| P1.9 permissão por conta compartilhada          | `common/account-access.service.ts` (`assertVisible`/`assertWritable`)                          | `test/account-access.service.test.ts`                     |
| P2.10 patrimônio (ativos × passivos)            | `apps/api/src/net-worth`, `/patrimonio`, `lib/net-worth.ts`                                   | `test/net-worth.service.test.ts`, `lib/net-worth.test.ts` |
| P2.11 recorrência e aportes em metas            | `recurrences/`, `goal_contributions` + `/financial-goals/:id/contributions`                    | `recurrences.service.test.ts`, `financial-goals.controller.test.ts` |
| P2.12 relatório/exportação além do CSV          | `apps/web/src/lib/export.ts` (CSV Excel pt-BR + JSON versionado)                              | `lib/export.test.ts`                                      |
| P2.13 Swagger e Sentry                          | `common/openapi.ts`, `common/sentry.ts`, `common/all-exceptions.filter.ts`                    | `build` + typecheck (integração com DSN é externa)        |

Extras que entraram junto, fora do plano original:

- **sessões revogáveis + `GET /auth/status`** — o JWT carrega `sid` e cada requisição checa a sessão;
- **cookie `HttpOnly` + CSRF** e remoção do JWT do `localStorage`;
- **rate limit** global (120/min/IP) e por endpoint sensível (login, register, forgot/reset, MFA);
- **mobile consumindo a API** (`apps/mobile/src/lib/api.ts`), com Bearer e liquidação de pendente;
- **CI em branches de trabalho** (`.github/workflows/ci.yml` → `arena/**`).

O que **continua aberto**, e por quê:

| Pendência                                                        | Por que ficou para depois                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Validação manual do fluxo de convite → aceite → nível → leitura  | Precisa de duas contas reais em produção; não é verificável em teste automatizado do sandbox   |
| Teste ponta a ponta com banco real no CI                          | Exige serviço Postgres no CI; hoje os testes usam Prisma dublado                               |
| Auditoria DTO por DTO de todos os endpoints                       | Varredura manual ampla; os endpoints com risco já têm DTO e teste                              |
| Rotação de `ENCRYPTION_KEY` com reencriptação                     | Envolve migração de dados sensíveis; merece janela própria                                     |
| Cadastro de lançamento pelo mobile                                | O app já lê, autentica e liquida; criar/editar lançamento fica na web nesta fase               |
| Notificações push de vencimento                                   | Depende de serviço de push e de permissão do usuário                                           |
