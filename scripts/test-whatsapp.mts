import { sendWebinarWhatsApp } from "../src/services/whatsappService.ts";

const result = await sendWebinarWhatsApp({
  registrationId: null,
  fullName: "Maxsas Test",
  phone: process.env.WHATSAPP_TEST_PHONE || "",
  workshopTitle: "Maxsas AI Voice Agent Workshop",
  eventDate: "25 August 2026",
  eventTime: "4:00 PM",
  hostName: "Anubhav Chaudhary",
  amount: 199,
});

console.log({
  success: result.success,
  skipped: result.skipped ?? false,
  messageId: result.messageId ?? null,
  recipient: result.recipient ?? null,
  reason: result.reason ?? null,
});
