-- Add auth tables required by the new OTP/password auth flow.
CREATE TABLE IF NOT EXISTS "EmailOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationIpAddress" TEXT,
    "verificationUserAgent" TEXT,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MagicToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "usedIpAddress" TEXT,
    "usedUserAgent" TEXT,

    CONSTRAINT "MagicToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailOtp_email_createdAt_idx" ON "EmailOtp"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailOtp_email_verified_expiresAt_idx" ON "EmailOtp"("email", "verified", "expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "MagicToken_tokenHash_key" ON "MagicToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "MagicToken_email_createdAt_idx" ON "MagicToken"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "MagicToken_email_used_expiresAt_idx" ON "MagicToken"("email", "used", "expiresAt");

CREATE INDEX IF NOT EXISTS "AuthSession_userId_revoked_idx" ON "AuthSession"("userId", "revoked");
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_createdAt_idx" ON "RefreshToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RefreshToken_sessionId_revoked_idx" ON "RefreshToken"("sessionId", "revoked");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
