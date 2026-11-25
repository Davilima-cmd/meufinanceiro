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
| Allocations (rateio)                               | Ausente        | —                                    | Nenhuma tabela ou regra                                     |
| Budgets                                            | Implementado   | `budgets.controller.ts`              | Gasto calculado por período                                 |
| Credit Cards / Purchases / Installments / Invoices | Ausente        | —                                    | Conta do tipo `credit` é só rótulo                          |
| Bills (a pagar/receber)                            | Ausente        | —                                    | Sem vencimento, status ou recorrência                       |
| Goals                                              | Implementado   | `financial-goals.controller.ts`      | Sem histórico de contribuições                              |
| Assets / Liabilities                               | Ausente        | —                                    | Sem patrimônio separado do saldo                            |
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
| Migrations versionadas (23)             | Implementado               | 2 migrations + `_prisma_migrations`                 |
| Exclusão lógica (23)                    | Ausente                    | Tudo é `DELETE` físico                              |
| `GET /status` / sessões revogáveis      | Parcial                    | `Session` existe; não é consultada a cada request   |

---

## 3. Problemas de integridade financeira encontrados

| #   | Problema                                                                          | Onde                                    | Regra violada   | Prioridade |
| --- | --------------------------------------------------------------------------------- | --------------------------------------- | --------------- | ---------- |
| 1   | Web em modo API não persiste nenhuma escrita                                      | `lib/store.tsx:122-130`                 | 21.10, 26 (MVP) | **P0**     |
| 2   | Saldo da conta não é afetado ao criar lançamento pela API                         | `transactions.controller.ts` (`create`) | 6.3, 21.10      | **P0**     |
| 3   | Transferência aceita no DTO mas não move dinheiro entre contas                    | `transaction.dto.ts` + controller       | 21.2            | **P0**     |
| 4   | `DELETE /transactions` inexistente como soft delete/estorno; web apaga em memória | `store.tsx` `deleteTransaction`         | 21.7, 21.8      | P1         |
| 5   | Sem lançamento pendente x liquidado                                               | modelo `Transaction`                    | 21.11           | P1         |
| 6   | Rateio inexistente                                                                | —                                       | 21.5, 21.6      | P1         |
| 7   | Nenhum endpoint valida permissão por núcleo/parceiro (só `userId`)                | todos os controllers                    | 20.2, 21.15     | P1         |
| 8   | Sem transação de banco em operações multi-registro                                | controllers                             | 21.9            | P1         |
| 9   | Dashboard do modo API não distingue competência de caixa                          | `analytics.ts`                          | 21.13           | P2         |

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
