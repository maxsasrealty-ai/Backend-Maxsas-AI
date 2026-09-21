-- CreateTable
CREATE TABLE "WebinarNotification" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient" TEXT,
    "templateName" TEXT,
    "providerMessageId" TEXT,
    "providerResponse" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebinarNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebinarNotification_registrationId_idx" ON "WebinarNotification"("registrationId");

-- CreateIndex
CREATE INDEX "WebinarNotification_channel_idx" ON "WebinarNotification"("channel");

-- CreateIndex
CREATE INDEX "WebinarNotification_status_idx" ON "WebinarNotification"("status");

-- CreateIndex
CREATE INDEX "WebinarNotification_providerMessageId_idx" ON "WebinarNotification"("providerMessageId");

-- CreateIndex
CREATE INDEX "WebinarNotification_createdAt_idx" ON "WebinarNotification"("createdAt");

-- AddForeignKey
ALTER TABLE "WebinarNotification" ADD CONSTRAINT "WebinarNotification_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "WebinarRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
