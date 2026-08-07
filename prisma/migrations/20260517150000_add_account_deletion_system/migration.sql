-- CreateEnum
CREATE TYPE "AccountDeletionRequestKind" AS ENUM ('account', 'data');

-- CreateEnum
CREATE TYPE "AccountDeletionRequestStatus" AS ENUM ('pending', 'processing', 'scheduled', 'completed', 'cancelled', 'purged', 'failed', 'restored');

-- AlterTable
ALTER TABLE "Tenant"
  ADD COLUMN "deletionStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionScheduledAt" TIMESTAMP(3),
  ADD COLUMN "deletionRestoreUntil" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletionCompletedAt" TIMESTAMP(3),
  ADD COLUMN "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "deletionStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "authRevokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestKind" "AccountDeletionRequestKind" NOT NULL,
    "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'pending',
    "requestedByUserId" TEXT,
    "requestedByEmail" TEXT,
    "reason" TEXT,
    "scopeJson" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3),
    "restoreUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "purgeExecutedAt" TIMESTAMP(3),
    "publicTrackingTokenHash" TEXT,
    "publicTrackingTokenHint" TEXT,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "restoreWindowDays" INTEGER NOT NULL DEFAULT 7,
    "auditJson" JSONB,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionAuditEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "requestId" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "summary" TEXT NOT NULL,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletionAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_deletionStatus_deletedAt_idx" ON "Tenant"("deletionStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "User_deletionStatus_deletedAt_idx" ON "User"("deletionStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_tenantId_requestedAt_idx" ON "AccountDeletionRequest"("tenantId", "requestedAt");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_tenantId_status_idx" ON "AccountDeletionRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_requestKind_status_idx" ON "AccountDeletionRequest"("requestKind", "status");

-- CreateIndex
CREATE INDEX "AccountDeletionAuditEntry_tenantId_createdAt_idx" ON "AccountDeletionAuditEntry"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountDeletionAuditEntry_requestId_createdAt_idx" ON "AccountDeletionAuditEntry"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountDeletionAuditEntry_action_createdAt_idx" ON "AccountDeletionAuditEntry"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
