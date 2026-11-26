-- Status e liquidação de lançamentos.
--
-- Antes, todo lançamento era tratado como efetivado e o saldo da conta mudava na
-- criação. Agora o lançamento tem ciclo de vida: nasce `pending` (a pagar/receber)
-- ou já `paid`, e o saldo só muda quando é liquidado — enquanto não há liquidação,
-- há uma conta a pagar, que não é dinheiro no caixa.
--
-- `competenceDate` guarda o mês a que o lançamento pertence (regime de
-- competência), separado de `date` (data de caixa) e de `dueDate` (vencimento).

-- 1. Novas colunas.
ALTER TABLE "transactions" ADD COLUMN "competenceDate" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'paid';
ALTER TABLE "transactions" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN "dueDate" TIMESTAMP(3);

-- 2. Dados existentes: todo lançamento histórico já afetou o saldo, então está
--    liquidado; a competência era a própria data de caixa.
UPDATE "transactions" SET "competenceDate" = "date" WHERE "competenceDate" IS NULL;
UPDATE "transactions" SET "paidAt" = "date" WHERE "status" = 'paid' AND "paidAt" IS NULL;

-- 3. A partir daqui o padrão é `pending`: quem grava já decide, e o que vem de
--    fora (importação) informa `paid` explicitamente.
ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'pending';

-- 4. Índices e checagem de domínio.
ALTER TABLE "transactions" ALTER COLUMN "competenceDate" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "competenceDate" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "transactions_competenceDate_idx" ON "transactions"("competenceDate");
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_status_check"
  CHECK ("status" IN ('pending', 'paid', 'canceled'));

-- 5. Reancora o saldo das contas que têm lançamento pendente.
--
--    O saldo era o somatório de TUDO, inclusive do que ainda não foi pago. Agora
--    ele representa caixa realizado: soma só o que está liquidado.
UPDATE "financial_accounts" AS a
SET "balanceCents" = COALESCE(
  (
    SELECT SUM(t."amountCents")
    FROM "transactions" AS t
    WHERE t."accountId" = a."id" AND t."status" = 'paid'
  ),
  0
)
WHERE EXISTS (SELECT 1 FROM "transactions" AS t WHERE t."accountId" = a."id");
