/*
  Warnings:

  - You are about to drop the column `budget` on the `LeadExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `intent` on the `LeadExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `LeadExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumber` on the `LeadExtraction` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "Speaker" ADD VALUE 'person';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VoiceEventType" ADD VALUE 'call_active';
ALTER TYPE "VoiceEventType" ADD VALUE 'call_transcript_final';
ALTER TYPE "VoiceEventType" ADD VALUE 'call_analysis_completed';

-- AlterTable
ALTER TABLE "CallSession" ADD COLUMN     "callOutcome" TEXT,
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "endedBy" TEXT;

-- AlterTable
ALTER TABLE "LeadExtraction" DROP COLUMN "budget",
DROP COLUMN "intent",
DROP COLUMN "location",
DROP COLUMN "phoneNumber",
ADD COLUMN     "budget_range" TEXT,
ADD COLUMN     "preferred_location" TEXT,
ALTER COLUMN "summary" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CallSession_tenantId_callOutcome_idx" ON "CallSession"("tenantId", "callOutcome");
