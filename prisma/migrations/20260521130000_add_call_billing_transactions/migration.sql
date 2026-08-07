-- CreateTable
CREATE TABLE "CallBillingTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT,
    "leadId" TEXT,
    "callId" TEXT NOT NULL,
    "walletAccountId" TEXT NOT NULL,
    "walletLedgerId" TEXT,
    "callDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "billedMinutes" INTEGER NOT NULL DEFAULT 0,
    "perMinuteRatePaise" INTEGER NOT NULL DEFAULT 540,
    "debitAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "callStatus" TEXT NOT NULL,
    "transactionMetaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallBillingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallBillingTransaction_walletLedgerId_key" ON "CallBillingTransaction"("walletLedgerId");

-- CreateIndex
CREATE UNIQUE INDEX "CallBillingTransaction_tenantId_callId_key" ON "CallBillingTransaction"("tenantId", "callId");

-- CreateIndex
CREATE INDEX "CallBillingTransaction_tenantId_batchId_createdAt_idx" ON "CallBillingTransaction"("tenantId", "batchId", "createdAt");

-- CreateIndex
CREATE INDEX "CallBillingTransaction_tenantId_callStatus_createdAt_idx" ON "CallBillingTransaction"("tenantId", "callStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "CallBillingTransaction" ADD CONSTRAINT "CallBillingTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBillingTransaction" ADD CONSTRAINT "CallBillingTransaction_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBillingTransaction" ADD CONSTRAINT "CallBillingTransaction_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "WalletAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBillingTransaction" ADD CONSTRAINT "CallBillingTransaction_walletLedgerId_fkey" FOREIGN KEY ("walletLedgerId") REFERENCES "WalletLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;