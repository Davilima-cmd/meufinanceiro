-- AlterTable: liga as duas pontas de uma transferência
ALTER TABLE "transactions" ADD COLUMN "transferId" VARCHAR(255);

-- CreateIndex
CREATE INDEX "transactions_transferId_idx" ON "transactions"("transferId");
