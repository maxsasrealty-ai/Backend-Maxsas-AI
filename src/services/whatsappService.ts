import axios from "axios";
import { prisma } from "../lib/prisma";

type WebinarWhatsAppParams = {
  registrationId?: string | null;
  fullName: string;
  phone: string;
  workshopTitle: string;
  eventDate: string;
  eventTime: string;
  hostName: string;
  amount: number;
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0+/, "");
}

function getConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";
  const templateName =
    process.env.WHATSAPP_CONFIRMATION_TEMPLATE ||
    "webinar_registration_confirmed";
  const language =
    process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";

  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured");
  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured");
  }

  return {
    token,
    phoneNumberId,
    apiVersion,
    templateName,
    language,
  };
}

async function persistWebinarNotification(params: {
  registrationId?: string | null;
  channel: string;
  event: string;
  status: string;
  recipient?: string | null;
  templateName?: string | null;
  providerMessageId?: string | null;
  providerResponse?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  try {
    await prisma.webinarNotification.create({
      data: {
        registrationId: params.registrationId ?? null,
        channel: params.channel,
        event: params.event,
        status: params.status,
        recipient: params.recipient ?? null,
        templateName: params.templateName ?? null,
        providerMessageId: params.providerMessageId ?? null,
        providerResponse: params.providerResponse ?? undefined,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to persist webinar WhatsApp notification record:', error);
  }
}

export async function sendWebinarWhatsApp(
  params: WebinarWhatsAppParams,
) {
  const templateName =
    process.env.WHATSAPP_CONFIRMATION_TEMPLATE ||
    "webinar_registration_confirmed";

  if (process.env.WHATSAPP_ENABLED !== "true") {
    await persistWebinarNotification({
      registrationId: params.registrationId ?? null,
      channel: "whatsapp",
      event: "webinar_registration_confirmed",
      status: "skipped",
      recipient: normalizePhone(params.phone),
      templateName,
      errorCode: "WHATSAPP_DISABLED",
      errorMessage: "WHATSAPP_ENABLED is false",
    });
    return {
      success: false,
      skipped: true,
      reason: "WHATSAPP_ENABLED is false",
    };
  }

  const config = getConfig();
  const recipient = normalizePhone(params.phone);

  if (!recipient || recipient.length < 10) {
    const error = new Error("Invalid WhatsApp recipient number");
    await persistWebinarNotification({
      registrationId: params.registrationId ?? null,
      channel: "whatsapp",
      event: "webinar_registration_confirmed",
      status: "failed",
      recipient,
      templateName,
      errorCode: "INVALID_RECIPIENT",
      errorMessage: error.message,
    });
    throw error;
  }

  const url =
    `https://graph.facebook.com/${config.apiVersion}` +
    `/${config.phoneNumberId}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: config.templateName,
          language: {
            code: config.language,
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: params.fullName,
                },
                {
                  type: "text",
                  text: params.workshopTitle,
                },
                {
                  type: "text",
                  text: params.eventDate,
                },
                {
                  type: "text",
                  text: params.eventTime,
                },
                {
                  type: "text",
                  text: params.hostName,
                },
                {
                  type: "text",
                  text: String(params.amount),
                },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        timeout: Number(process.env.WHATSAPP_TIMEOUT_MS || 10000),
      },
    );

    await persistWebinarNotification({
      registrationId: params.registrationId ?? null,
      channel: "whatsapp",
      event: "webinar_registration_confirmed",
      status: "sent",
      recipient,
      templateName: config.templateName,
      providerMessageId: response.data?.messages?.[0]?.id || null,
      providerResponse: response.data,
    });

    return {
      success: true,
      messageId: response.data?.messages?.[0]?.id || null,
      recipient,
      response: response.data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = axios.isAxiosError(error) ? String(error.response?.status ?? "axios_error") : "request_error";
    await persistWebinarNotification({
      registrationId: params.registrationId ?? null,
      channel: "whatsapp",
      event: "webinar_registration_confirmed",
      status: "failed",
      recipient,
      templateName: config.templateName,
      errorCode: status,
      errorMessage: message,
      providerResponse: axios.isAxiosError(error) ? error.response?.data ?? null : null,
    });
    throw error;
  }
}