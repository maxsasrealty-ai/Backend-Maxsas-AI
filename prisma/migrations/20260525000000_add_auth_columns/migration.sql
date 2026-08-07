-- Add auth-related columns that newer application code expects.
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "capabilitiesJson" JSONB;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'member';
