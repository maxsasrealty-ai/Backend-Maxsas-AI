-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PaymentProvider" AS ENUM ('payu', 'razorpay');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PaymentProviderMode" AS ENUM ('test', 'live');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PaymentOrderStatus" AS ENUM ('created', 'pending', 'initiated', 'success', 'failed', 'cancelled', 'expired');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PaymentAttemptStatus" AS ENUM ('initiated', 'pending', 'success', 'failed', 'declined');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "EntryDirection" AS ENUM ('credit', 'debit');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "EntryType" AS ENUM ('wallet_topup', 'usage_debit', 'manual_credit', 'manual_debit', 'refund', 'adjustment');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "LedgerEntryStatus" AS ENUM ('pending', 'success', 'failed', 'reversed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "WebhookProcessingStatus" AS ENUM ('received', 'processed', 'failed', 'ignored');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ReconciliationCheckType" AS ENUM ('webhook_vs_verify', 'redirect_vs_webhook', 'manual_recheck');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ReconciliationStatus" AS ENUM ('matched', 'mismatched', 'resolved');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletAccountId" TEXT NOT NULL,
    "direction" "EntryDirection" NOT NULL DEFAULT 'credit',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'pending',
    "entryType" "EntryType" NOT NULL DEFAULT 'wallet_topup',
    "paymentOrderId" TEXT,
    "paymentAttemptId" TEXT,
    "externalTxnId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "metaJson" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletAccountId" TEXT,
    "userId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "purpose" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'payu',
    "providerMode" "PaymentProviderMode" NOT NULL DEFAULT 'test',
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'created',
    "payuTxnId" TEXT,
    "merchantTxnId" TEXT,
    "redirectUrl" TEXT,
    "successUrl" TEXT,
    "failureUrl" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'payu',
    "providerMode" "PaymentProviderMode" NOT NULL DEFAULT 'test',
    "providerPaymentId" TEXT,
    "providerTxnId" TEXT,
    "requestPayloadJson" JSONB NOT NULL,
    "responsePayloadJson" JSONB,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'initiated',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'payu',
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT,
    "providerTxnId" TEXT,
    "rawHeadersJson" JSONB,
    "rawBodyJson" JSONB NOT NULL,
    "normalizedBodyJson" JSONB,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'received',
    "processingError" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'payu',
    "checkType" "ReconciliationCheckType" NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'matched',
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_ingest_audit" (
    "id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT,
    "message" TEXT,
    "event_type" TEXT,
    "call_id" TEXT,
    "tenant_id" TEXT,
    "payload_json" JSONB,
    "source" TEXT,

    CONSTRAINT "voice_ingest_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletAccount_tenantId_status_idx" ON "WalletAccount"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WalletAccount_tenantId_createdAt_idx" ON "WalletAccount"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_tenantId_userId_key" ON "WalletAccount"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "WalletLedger_tenantId_walletAccountId_idx" ON "WalletLedger"("tenantId", "walletAccountId");

-- CreateIndex
CREATE INDEX "WalletLedger_tenantId_status_idx" ON "WalletLedger"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WalletLedger_tenantId_createdAt_idx" ON "WalletLedger"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedger_paymentOrderId_idx" ON "WalletLedger"("paymentOrderId");

-- CreateIndex
CREATE INDEX "WalletLedger_externalTxnId_idx" ON "WalletLedger"("externalTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedger_walletAccountId_idempotencyKey_key" ON "WalletLedger"("walletAccountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentOrder_tenantId_status_idx" ON "PaymentOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_tenantId_payuTxnId_idx" ON "PaymentOrder"("tenantId", "payuTxnId");

-- CreateIndex
CREATE INDEX "PaymentOrder_tenantId_createdAt_idx" ON "PaymentOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_tenantId_merchantTxnId_key" ON "PaymentOrder"("tenantId", "merchantTxnId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenantId_paymentOrderId_idx" ON "PaymentAttempt"("tenantId", "paymentOrderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenantId_status_idx" ON "PaymentAttempt"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenantId_providerTxnId_idx" ON "PaymentAttempt"("tenantId", "providerTxnId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenantId_createdAt_idx" ON "PaymentAttempt"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_idempotencyKey_key" ON "PaymentWebhookEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_tenantId_processingStatus_idx" ON "PaymentWebhookEvent"("tenantId", "processingStatus");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_tenantId_createdAt_idx" ON "PaymentWebhookEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_providerTxnId_idx" ON "PaymentWebhookEvent"("provider", "providerTxnId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_tenantId_paymentOrderId_idx" ON "PaymentReconciliation"("tenantId", "paymentOrderId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_tenantId_status_idx" ON "PaymentReconciliation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_tenantId_createdAt_idx" ON "PaymentReconciliation"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "voice_ingest_audit_received_at_idx" ON "voice_ingest_audit"("received_at");

-- CreateIndex
CREATE INDEX "voice_ingest_audit_tenant_id_received_at_idx" ON "voice_ingest_audit"("tenant_id", "received_at");

-- CreateIndex
CREATE INDEX "voice_ingest_audit_call_id_idx" ON "voice_ingest_audit"("call_id");

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "WalletAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
