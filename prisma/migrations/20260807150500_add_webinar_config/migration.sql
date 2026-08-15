-- CreateEnum
CREATE TYPE "WebinarConfigStatus" AS ENUM ('OPEN', 'SEATS_FULL', 'COMPLETED');

-- CreateTable
CREATE TABLE "WebinarConfig" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subTitle" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "eventTime" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "ticketPrice" INTEGER NOT NULL,
    "zoomLink" TEXT NOT NULL,
    "whatsappGroupLink" TEXT NOT NULL,
    "status" "WebinarConfigStatus" NOT NULL DEFAULT 'OPEN',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebinarConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebinarConfig_status_updatedAt_idx"
    ON "WebinarConfig"("status", "updatedAt");
