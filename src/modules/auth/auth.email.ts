import * as nodemailer from "nodemailer";

import { config } from "../../lib/config";

export interface AuthEmailPayload {
  email: string;
  otp: string;
  expiresMinutes: number;
  subject?: string;
  magicLinkUrl?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function resolveSenderIdentity(fallbackEmail: string): { name: string; email: string } {
  const fromValue = config.smtp.from?.trim();

  if (!fromValue) {
    return { name: "Maxsas Realty", email: fallbackEmail };
  }

  const match = fromValue.match(/^(.*)<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "") || "Maxsas Realty";
    const email = match[2].trim();
    return { name, email };
  }

  return { name: "Maxsas Realty", email: fromValue };
}

function buildTemplate(payload: AuthEmailPayload) {
  const safeEmail = escapeHtml(payload.email);
  const safeOtp = escapeHtml(payload.otp);
  const safeMagicLink = payload.magicLinkUrl ? escapeHtml(payload.magicLinkUrl) : "";

  const actionText = payload.magicLinkUrl
    ? "Use the code below or the magic link button to finish logging in to your workspace."
    : "Use the code below to complete your request.";
  const magicLinkSection = payload.magicLinkUrl
    ? `<a href="${safeMagicLink}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,#38bdf8 0%,#2563eb 100%);color:#fff;text-decoration:none;font-weight:700;font-size:15px;">Open secure magic link</a>`
    : "";

  const text = [
    payload.subject || "Maxsas Realty login",
    `Your one-time code: ${payload.otp}`,
    payload.magicLinkUrl ? `Magic link: ${payload.magicLinkUrl}` : undefined,
    `This code expires in ${payload.expiresMinutes} minutes.`,
    "If you did not request this, ignore this message.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = `<!doctype html><html><body style="margin:0;background:#0b1220;padding:32px 16px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#dbe4ff;"><div style="max-width:640px;margin:0 auto;background:linear-gradient(180deg,#111a30 0%,#0d1426 100%);border:1px solid rgba(148,163,184,.2);border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);"><div style="padding:28px 32px;border-bottom:1px solid rgba(148,163,184,.16);background:linear-gradient(135deg,#172554 0%,#0f172a 55%,#111827 100%);"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">Maxsas Realty</div><h1 style="margin:0;font-size:28px;line-height:1.15;color:#f8fafc;">${escapeHtml(payload.subject || "Secure sign-in request")}</h1><p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#cbd5e1;">${escapeHtml(actionText)}</p></div><div style="padding:32px;"><div style="padding:20px;border-radius:18px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.16);margin-bottom:24px;"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;">One-time code</div><div style="font-size:40px;letter-spacing:.18em;font-weight:800;color:#f8fafc;">${safeOtp}</div><p style="margin:14px 0 0;color:#94a3b8;font-size:14px;line-height:1.6;">This code expires in ${payload.expiresMinutes} minutes and can be used once.</p></div>${magicLinkSection}<p style="margin:24px 0 0;color:#cbd5e1;font-size:14px;line-height:1.7;">This request was made for <strong>${safeEmail}</strong>. If you did not start this request, you can safely ignore this email.</p><p style="margin:16px 0 0;color:#94a3b8;font-size:13px;line-height:1.6;">For security, do not forward this email or share the code with anyone.</p></div></div></body></html>`;

  return { html, text };
}

function createTransport() {
  const hasSmtp = Boolean(config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.pass && config.smtp.from);

  if (hasSmtp) {
    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  return nodemailer.createTransport({ streamTransport: true, newline: "unix", buffer: true });
}

async function sendViaBrevoApi(payload: AuthEmailPayload, html: string, text: string): Promise<void> {
  if (!config.brevo.apiKey) {
    throw new Error("Brevo API key is not configured");
  }

  const sender = resolveSenderIdentity("maxsasrealty@gmail.com");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": config.brevo.apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: payload.email }],
      subject: payload.subject || "Your Maxsas Realty login code",
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Brevo API send failed with ${response.status}: ${errorText || response.statusText}`);
  }
}

export async function sendAuthEmail(payload: AuthEmailPayload): Promise<void> {
  const { html, text } = buildTemplate(payload);
  const hasSmtp = Boolean(config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.pass && config.smtp.from);

  if (!hasSmtp) {
    if (config.brevo.apiKey) {
      await sendViaBrevoApi(payload, html, text);
      return;
    }

    if (config.isProduction) {
      throw new Error("SMTP configuration or Brevo API key is required in production");
    }
  }

  const transport = createTransport();

  try {
    await transport.sendMail({
      from: config.smtp.from || "Maxsas Realty <no-reply@maxsas.local>",
      to: payload.email,
      subject: payload.subject || "Your Maxsas Realty login code",
      text,
      html,
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    const isSmtpReachabilityFailure = code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION" || code === "ECONNRESET";

    if (!config.brevo.apiKey || !isSmtpReachabilityFailure) {
      throw error;
    }

    await sendViaBrevoApi(payload, html, text);
  }
}
