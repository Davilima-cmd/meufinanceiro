# Checklist de validação manual — produção

Tudo o que dependia de **duas contas reais** e de navegador ficou aqui: o sandbox
não faz login autenticado em `*.vercel.app` (SSL bloqueado) e não tem duas pessoas.
Os testes automatizados cobrem as mesmas regras com Prisma dublado; o que segue é a
confirmação ponta a ponta.

- Web: https://meufinanceiro-ashen-eight.vercel.app
- API: https://meufinanceiro-api-davi-lima2.vercel.app/api (`/api/health` responde `{ status: "ok", db: "ok" }`)
- Deploy desta rodada: api `dpl_HyWLNmjLTLigEWq6pJK2bzEKTS26`, web `dpl_FYLovEjRnjfbRw7tfNN8PLRzSM4W`
  (commit `07bdeca`; CI verde em `2f31ccb`).

---

## 1. Sessão em cookie + CSRF (5 min)

1. Entre com sua conta real (não o modo demonstração).
2. Abra o DevTools → **Application → Cookies**. Deve existir **`mf_session`** marcado
   `HttpOnly` e **`mf_csrf`** legível.
3. Em **Local Storage** não pode haver token JWT (só `mf_user`/preferências).
4. Recarregue o painel: a sessão continua e os dados vêm da API.
5. Clique em **Sair**. O cookie `mf_session` desaparece e voltar para `/` leva ao login.

**Falha esperada se algo estiver errado:** escrita devolvendo `403` significa
`X-CSRF-Token` ausente/divergente; `401` ao recarregar significa cookie não enviado.

## 2. Sessão revogada em outro aparelho (3 min)

1. Entre no notebook e no celular com a **mesma** conta.
2. No celular, use **Sair de todos os aparelhos** (ou troque a senha).
3. Recarregue o notebook: deve cair no login com a mensagem de sessão encerrada.

## 3. Convite → aceite → nível → somente leitura (10 min)

Precisa de **duas contas** (você e outra pessoa — pode ser um e-mail seu).

1. Conta A: **Casal** → convidar o e-mail da conta B.
2. Conta B: em **Casal** aparece **“Convites recebidos”** com o nome de A → **Aceitar**.
3. Conta A: mude o nível de uma conta para **Somente saldo** (`BALANCE_ONLY`); em Conta B o
   saldo aparece e os lançamentos **não**.
4. Conta A: mude para **Completo** (`FULL`); em B os lançamentos aparecem.
5. Conta B: tente criar/editar/excluir um lançamento dessa conta → a interface não oferece a
   ação; se forçar pela API, a resposta é **403** com “Conta compartilhada é somente leitura…”.
6. Conta A: mude para **Privada**; a conta some da visão de B.
7. Conta A: **Desfazer parceria**; some tudo dos dois lados.

## 4. Soft delete (5 min)

1. Crie um lançamento, anote o saldo da conta.
2. Exclua o lançamento: o valor **volta** ao saldo.
3. No banco (ou via `GET /transactions`), o lançamento não aparece mais; a linha continua
   existindo com `deletedAt` preenchido (requisito 23).
4. Exclua uma conta **com histórico**: antes dava `400`; agora deve funcionar e a conta
   desaparece das listas e do patrimônio.
5. Se a conta tinha compartilhamento, ele deve sumir da visão do parceiro.

## 5. Vencimentos e lembretes (5 min)

1. Crie um lançamento **pendente** com vencimento **ontem**.
2. **Visão geral** mostra o aviso “Vencimentos: … atrasada(s)”.
3. **Vencimentos** lista o item como **Atrasado**; clique em **Paguei** → some da lista e o
   saldo da conta muda.
4. Crie um pendente para **daqui a 2 dias**: aparece em “Próximos dias”.

## 6. Recorrência (5 min)

1. `POST /api/recurrences` (Swagger `/api/docs` está **desligado** em produção; use cliente HTTP)
   com `{ accountId, description, amountCents: "-150000", type: "expense", dayOfMonth: 5 }`.
2. `POST /api/recurrences/run` → `{ created: 1 }` (o primeiro lançamento vence no mês seguinte).
3. Rode `run` de novo: **não** cria outro (`created: 0`).
4. O lançamento gerado nasce **pendente**, com `origin: "recurring"`.

## 7. Rateio (5 min)

1. Com a parceria ativa, escolha um lançamento de **R$ 100,00**.
2. `PUT /api/allocations/transactions/{id}` com
   `{ "participants": ["SEU_ID", "ID_DO_PARCEIRO"] }`.
3. `GET /api/allocations/transactions/{id}` → duas partes de `5000` (soma exata).
4. Teste ímpar: lançamento de `10001` → partes `5001` e `5000`, somando `10001`.
5. `GET /api/allocations/summary` mostra `openCents` por pessoa.
6. `POST /api/allocations/transactions/{id}/settle` com o id do parceiro; repetir → **404**.

## 8. Metas com histórico (3 min)

1. **Metas** → **Guardar** R$ 50 com observação “teste”.
2. **Histórico** mostra o aporte com data e observação.
3. Remova o aporte pela API (`DELETE /financial-goals/{id}/contributions/{cid}`): o saldo da
   meta volta ao valor anterior.

## 9. Patrimônio (3 min)

1. **Patrimônio** → adicione um bem (R$ 50.000) e uma dívida (R$ 45.000).
2. O patrimônio líquido sobe R$ 5.000, e a dívida **subtrai**.
3. Tente cadastrar valor negativo: deve ser recusado.

## 10. Limites de requisição (2 min)

1. Erre a senha 11 vezes em `/login`.
2. A 11ª resposta deve ser **429** com `Retry-After` (o limite é 10/min por IP).

---

## O que já está verificado sem você

- `pnpm lint`, `typecheck`, `test`, `build` verdes localmente (api 28 arquivos/228 testes,
  web 12/97, mobile 2/15).
- CI do GitHub verde no commit `2f31ccb` (quality + Gitleaks).
- Migrações aplicadas no Supabase de produção: `deletedAt` em `financial_accounts` e
  `transactions`; tabelas `allocations`, `recurrences`, `goal_contributions`,
  `net_worth_items`.
- `GET /api/health` em produção: `{ "status": "ok", "db": "ok" }`.
- Deploys de api e web `READY` e promovidos para produção.
