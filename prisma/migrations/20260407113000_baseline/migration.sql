-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlanKey" AS ENUM ('basic', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "CallLifecycleStatus" AS ENUM ('queued', 'initiated', 'dispatching', 'ringing', 'connected', 'active', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "VoiceEventType" AS ENUM ('transcript_partial', 'transcript_final', 'call_ringing', 'call_connected', 'call_started', 'lead_extracted', 'call_completed', 'call_failed', 'publisher_test', 'agent_log');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('user', 'agent');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'queued', 'active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "OutboundRequestStatus" AS ENUM ('queued', 'dispatching', 'dispatched', 'failed');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('call_charge');

-- CreateEnum
CREATE TYPE "UsageRecordStatus" AS ENUM ('bypassed', 'rejected', 'charged');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "plan" "PlanKey" NOT NULL DEFAULT 'basic',
    "workspaceConfigJson" JSONB,
    "featuresJson" JSONB,
    "walletBalancePaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalCallId" TEXT,
    "roomId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "agentName" TEXT,
    "direction" TEXT,
    "status" "CallLifecycleStatus" NOT NULL DEFAULT 'initiated',
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "transcriptTurns" INTEGER,
    "recordingUrl" TEXT,
    "estimatedCost" DECIMAL(10,2),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" "VoiceEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadJson" JSONB,
    "rawEnvelope" JSONB,
    "rawHeaders" JSONB,
    "normalizedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "text" TEXT NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "sequenceNo" INTEGER NOT NULL,
    "providerMessageId" TEXT,
    "rawJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadExtraction" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "summary" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "intent" TEXT,
    "propertyType" TEXT,
    "location" TEXT,
    "budget" TEXT,
    "timeline" TEXT,
    "phoneNumber" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCall" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignContact" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceCallId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "provider" TEXT,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "referenceId" TEXT,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundCallRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "agentName" TEXT,
    "status" "OutboundRequestStatus" NOT NULL DEFAULT 'queued',
    "payloadJson" JSONB,
    "errorMessage" TEXT,
    "callSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundCallRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "usageType" "UsageType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "UsageRecordStatus" NOT NULL,
    "sourceEventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_createdAt_idx" ON "Tenant"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_createdAt_idx" ON "User"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CallSession_tenantId_status_idx" ON "CallSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CallSession_tenantId_initiatedAt_idx" ON "CallSession"("tenantId", "initiatedAt");

-- CreateIndex
CREATE INDEX "CallSession_tenantId_createdAt_idx" ON "CallSession"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_tenantId_externalCallId_key" ON "CallSession"("tenantId", "externalCallId");

-- CreateIndex
CREATE UNIQUE INDEX "CallEvent_eventId_key" ON "CallEvent"("eventId");

-- CreateIndex
CREATE INDEX "CallEvent_tenantId_callId_eventType_occurredAt_idx" ON "CallEvent"("tenantId", "callId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "CallEvent_tenantId_createdAt_idx" ON "CallEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TranscriptSegment_tenantId_callId_sequenceNo_idx" ON "TranscriptSegment"("tenantId", "callId", "sequenceNo");

-- CreateIndex
CREATE INDEX "TranscriptSegment_tenantId_createdAt_idx" ON "TranscriptSegment"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_callId_sequenceNo_key" ON "TranscriptSegment"("callId", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "LeadExtraction_callId_key" ON "LeadExtraction"("callId");

-- CreateIndex
CREATE INDEX "LeadExtraction_tenantId_createdAt_idx" ON "LeadExtraction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_status_idx" ON "Campaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_createdAt_idx" ON "Campaign"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignCall_tenantId_createdAt_idx" ON "CampaignCall"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCall_campaignId_callId_key" ON "CampaignCall"("campaignId", "callId");

-- CreateIndex
CREATE INDEX "CampaignContact_tenantId_createdAt_idx" ON "CampaignContact"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "WalletTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_tenantId_providerOrderId_key" ON "WalletTransaction"("tenantId", "providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_tenantId_referenceId_key" ON "WalletTransaction"("tenantId", "referenceId");

-- CreateIndex
CREATE INDEX "OutboundCallRequest_tenantId_status_idx" ON "OutboundCallRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OutboundCallRequest_tenantId_createdAt_idx" ON "OutboundCallRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_createdAt_idx" ON "UsageRecord"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_tenantId_callId_usageType_sourceEventId_key" ON "UsageRecord"("tenantId", "callId", "usageType", "sourceEventId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadExtraction" ADD CONSTRAINT "LeadExtraction_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadExtraction" ADD CONSTRAINT "LeadExtraction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCall" ADD CONSTRAINT "CampaignCall_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCall" ADD CONSTRAINT "CampaignCall_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCall" ADD CONSTRAINT "CampaignCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_sourceCallId_fkey" FOREIGN KEY ("sourceCallId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundCallRequest" ADD CONSTRAINT "OutboundCallRequest_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundCallRequest" ADD CONSTRAINT "OutboundCallRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

