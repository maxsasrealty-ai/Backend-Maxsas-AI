-- CreateEnum
CREATE TYPE "WebinarStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'PAYMENT_PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Webinar" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "priceInPaise" INTEGER NOT NULL,
    "status" "WebinarStatus" NOT NULL DEFAULT 'DRAFT',
    "speakerName" TEXT NOT NULL,
    "speakerDesignation" TEXT NOT NULL,
    "speakerExperience" TEXT NOT NULL,
    "speakerImageUrl" TEXT,
    "benefits" JSONB NOT NULL,
    "agenda" JSONB NOT NULL,
    "testimonials" JSONB NOT NULL,
    "faqs" JSONB NOT NULL,
    "whoShouldAttend" JSONB NOT NULL,
    "whatsappGroupLink" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "ogImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webinar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebinarRegistration" (
    "id" TEXT NOT NULL,
    "webinarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company" TEXT,
    "city" TEXT,
    "monthlyLeads" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebinarRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebinarPaymentEvent" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "razorpayEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebinarPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Webinar_slug_key" ON "Webinar"("slug");

-- CreateIndex
CREATE INDEX "Webinar_status_date_idx" ON "Webinar"("status", "date");

-- CreateIndex
CREATE INDEX "WebinarRegistration_webinarId_status_idx" ON "WebinarRegistration"("webinarId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebinarPaymentEvent_razorpayEventId_key" ON "WebinarPaymentEvent"("razorpayEventId");

-- AddForeignKey
ALTER TABLE "WebinarRegistration" ADD CONSTRAINT "WebinarRegistration_webinarId_fkey" FOREIGN KEY ("webinarId") REFERENCES "Webinar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebinarPaymentEvent" ADD CONSTRAINT "WebinarPaymentEvent_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "WebinarRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
