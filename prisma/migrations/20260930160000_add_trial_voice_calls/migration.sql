CREATE TYPE "TrialCallStatus" AS ENUM (
  'QUEUED',
  'INITIATING',
  'RINGING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "TrialCallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE "TrialCallWebhookStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'IGNORED'
);

CREATE TABLE "TrialCall" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT,
  "webinarRegistrationId" TEXT,
  "phoneNumber" TEXT NOT NULL,
  "customerName" TEXT,
  "provider" TEXT NOT NULL,
  "providerCallId" TEXT,
  "agentId" TEXT,
  "status" "TrialCallStatus" NOT NULL DEFAULT 'QUEUED',
  "subStatus" TEXT,
  "callDirection" "TrialCallDirection" NOT NULL DEFAULT 'OUTBOUND',
  "durationSeconds" INTEGER,
  "recordingUrl" TEXT,
  "transcript" TEXT,
  "outcome" TEXT,
  "outcomeData" JSONB,
  "initiatedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "lastWebhookAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrialCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrialCallWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT,
  "eventType" TEXT NOT NULL,
  "providerCallId" TEXT,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "processingStatus" "TrialCallWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "errorMessage" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  CONSTRAINT "TrialCallWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialCallWebhookEvent_idempotencyKey_key"
  ON "TrialCallWebhookEvent"("idempotencyKey");
CREATE INDEX "TrialCall_tenantId_createdAt_idx" ON "TrialCall"("tenantId", "createdAt");
CREATE INDEX "TrialCall_webinarRegistrationId_createdAt_idx" ON "TrialCall"("webinarRegistrationId", "createdAt");
CREATE INDEX "TrialCall_userId_createdAt_idx" ON "TrialCall"("userId", "createdAt");
CREATE INDEX "TrialCall_provider_providerCallId_idx" ON "TrialCall"("provider", "providerCallId");
CREATE INDEX "TrialCall_status_createdAt_idx" ON "TrialCall"("status", "createdAt");
CREATE INDEX "TrialCallWebhookEvent_provider_providerCallId_receivedAt_idx"
  ON "TrialCallWebhookEvent"("provider", "providerCallId", "receivedAt");
CREATE INDEX "TrialCallWebhookEvent_processingStatus_receivedAt_idx"
  ON "TrialCallWebhookEvent"("processingStatus", "receivedAt");

ALTER TABLE "TrialCall"
  ADD CONSTRAINT "TrialCall_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TrialCall_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TrialCall_webinarRegistrationId_fkey"
    FOREIGN KEY ("webinarRegistrationId") REFERENCES "WebinarRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;