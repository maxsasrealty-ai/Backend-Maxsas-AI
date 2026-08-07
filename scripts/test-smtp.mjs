#!/usr/bin/env node

/**
 * SMTP smoke test for the configured Brevo relay.
 *
 * Usage:
 *   node scripts/test-smtp.mjs someone@example.com
 *   TEST_SMTP_TO=someone@example.com node scripts/test-smtp.mjs
 */

import nodemailer from "nodemailer";

const recipient = process.argv[2] || process.env.TEST_SMTP_TO;

if (!recipient) {
  console.error("Usage: node scripts/test-smtp.mjs <recipient-email>");
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT || 587);
const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM || "Maxsas Realty <no-reply@maxsas.local>";

if (!host || !user || !pass) {
  console.error("Missing SMTP configuration in environment.");
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
});

const subject = `Maxsas SMTP test ${new Date().toISOString()}`;
const text = [
  "SMTP test successful.",
  "If this reached the inbox, the backend SMTP relay is working.",
  `Recipient: ${recipient}`,
].join("\n\n");

const html = `<p>SMTP test successful.</p><p>If this reached the inbox, the backend SMTP relay is working.</p><p>Recipient: ${recipient}</p>`;

try {
  console.log(`Verifying SMTP connectivity to ${host}:${port} ...`);
  await transport.verify();
  console.log("Connectivity verified. Sending test message...");

  const info = await transport.sendMail({
    from,
    to: recipient,
    subject,
    text,
    html,
  });

  console.log(JSON.stringify({
    verified: true,
    accepted: info.accepted,
    rejected: info.rejected,
    messageId: info.messageId,
    response: info.response,
  }, null, 2));
} catch (error) {
  console.error("SMTP test failed.");
  console.error(JSON.stringify({
    code: error.code,
    command: error.command,
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
}