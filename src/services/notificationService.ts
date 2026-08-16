interface RegistrationDetails {
  fullName: string;
  email: string;
  phone: string;
  amount: number;
  paymentId?: string;
  webinarTitle?: string;
  webinarDate?: string;
  webinarTime?: string;
  hostName?: string;
  zoomLink?: string;
  whatsappGroupLink?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendWebinarEmail(details: RegistrationDetails): Promise<void> {
  const brevoApiKey = process.env.BREVO_API_KEY;

  if (!brevoApiKey) {
    console.error('BREVO_API_KEY is not configured. Webinar confirmation email skipped.');
    return;
  }

  const senderEmail =
    process.env.SMTP_FROM ||
    process.env.SENDER_EMAIL ||
    'info@maxsasrealty.ai';

  const webinarTitle =
    details.webinarTitle || 'Maxsas AI Voice Agent Workshop';

  const webinarDate =
    details.webinarDate || 'Date will be announced';

  const webinarTime =
    details.webinarTime || 'Time will be announced';

  const hostName =
    details.hostName || 'Anubhav Chaudhary';

  const zoomLink = String(details.zoomLink || '').trim();
  const whatsappGroupLink = String(details.whatsappGroupLink || '').trim();

  const safeName = escapeHtml(details.fullName);
  const safeTitle = escapeHtml(webinarTitle);
  const safeDate = escapeHtml(webinarDate);
  const safeTime = escapeHtml(webinarTime);
  const safeHost = escapeHtml(hostName);
  const safeAmount = escapeHtml(details.amount.toFixed(2));
  const safePaymentId = escapeHtml(details.paymentId || '');

  const zoomSection = zoomLink
    ? `
      <tr>
        <td style="padding:8px 0;">
          <a
            href="${escapeHtml(zoomLink)}"
            style="
              display:inline-block;
              background:#635BFF;
              color:#ffffff;
              text-decoration:none;
              padding:12px 20px;
              border-radius:8px;
              font-weight:700;
            "
          >
            Join Zoom Webinar
          </a>
        </td>
      </tr>
    `
    : '';

  const whatsappSection = whatsappGroupLink
    ? `
      <tr>
        <td style="padding:8px 0;">
          <a
            href="${escapeHtml(whatsappGroupLink)}"
            style="
              display:inline-block;
              background:#25D366;
              color:#ffffff;
              text-decoration:none;
              padding:12px 20px;
              border-radius:8px;
              font-weight:700;
            "
          >
            Join WhatsApp Group
          </a>
        </td>
      </tr>
    `
    : '';

  const accessSection =
    zoomLink || whatsappGroupLink
      ? `
        <div
          style="
            background:#0E1220;
            border:1px solid #232A44;
            border-radius:12px;
            padding:20px;
            margin:24px 0;
          "
        >
          <h3 style="margin:0 0 14px;color:#F4F6FB;">
            Workshop Access
          </h3>

          <table cellpadding="0" cellspacing="0" border="0">
            ${zoomSection}
            ${whatsappSection}
          </table>
        </div>
      `
      : `
        <div
          style="
            background:#0E1220;
            border:1px solid #232A44;
            border-radius:12px;
            padding:18px;
            margin:24px 0;
            color:#B8C0D8;
          "
        >
          Your workshop access details will be shared separately.
        </div>
      `;

  const paymentIdRow = safePaymentId
    ? `
      <p style="margin:7px 0;">
        <strong>Payment ID:</strong> ${safePaymentId}
      </p>
    `
    : '';

  const payload = {
    sender: {
      name: 'Maxsas AI',
      email: senderEmail,
    },

    to: [
      {
        email: details.email,
        name: details.fullName,
      },
    ],

    subject: `Registration Confirmed — ${webinarTitle}`,

    htmlContent: `
      <!DOCTYPE html>
      <html>
        <body
          style="
            margin:0;
            padding:0;
            background:#06080F;
            font-family:Arial,Helvetica,sans-serif;
            color:#F4F6FB;
          "
        >
          <div style="max-width:680px;margin:0 auto;padding:28px 18px;">

            <div
              style="
                background:#0A0D16;
                border:1px solid #20263A;
                border-radius:16px;
                padding:28px;
              "
            >

              <div style="margin-bottom:24px;">
                <div
                  style="
                    font-size:13px;
                    font-weight:700;
                    letter-spacing:1.5px;
                    color:#8D96B3;
                    text-transform:uppercase;
                  "
                >
                  MAXSAS AI
                </div>

                <h1
                  style="
                    margin:10px 0 0;
                    font-size:28px;
                    line-height:1.2;
                    color:#F4F6FB;
                  "
                >
                  Registration Confirmed
                </h1>
              </div>

              <p style="font-size:16px;line-height:1.7;">
                Hi <strong>${safeName}</strong>,
              </p>

              <p style="font-size:15px;line-height:1.7;color:#C8CEDF;">
                Your registration and payment for the
                <strong style="color:#F4F6FB;">
                  ${safeTitle}
                </strong>
                have been successfully confirmed.
              </p>

              <div
                style="
                  background:#0E1220;
                  border:1px solid #232A44;
                  border-radius:12px;
                  padding:20px;
                  margin:24px 0;
                "
              >
                <h2
                  style="
                    margin:0 0 16px;
                    font-size:18px;
                    color:#F4F6FB;
                  "
                >
                  Workshop Details
                </h2>

                <p style="margin:7px 0;">
                  <strong>Workshop:</strong> ${safeTitle}
                </p>

                <p style="margin:7px 0;">
                  <strong>Date:</strong> ${safeDate}
                </p>

                <p style="margin:7px 0;">
                  <strong>Time:</strong> ${safeTime}
                </p>

                <p style="margin:7px 0;">
                  <strong>Host:</strong> ${safeHost}
                </p>
              </div>

              <div
                style="
                  background:#0E1220;
                  border:1px solid #232A44;
                  border-radius:12px;
                  padding:20px;
                  margin:24px 0;
                "
              >
                <h2
                  style="
                    margin:0 0 16px;
                    font-size:18px;
                    color:#F4F6FB;
                  "
                >
                  Payment Details
                </h2>

                <p style="margin:7px 0;">
                  <strong>Status:</strong>
                  <span style="color:#55D68A;font-weight:700;">
                    PAID
                  </span>
                </p>

                <p style="margin:7px 0;">
                  <strong>Amount:</strong> ₹${safeAmount}
                </p>

                ${paymentIdRow}
              </div>

              ${accessSection}

              <p
                style="
                  margin-top:28px;
                  color:#8D96B3;
                  font-size:13px;
                  line-height:1.7;
                "
              >
                Please keep this email for your workshop registration
                details.
              </p>

              <p
                style="
                  color:#8D96B3;
                  font-size:13px;
                  line-height:1.7;
                "
              >
                See you at the workshop!
                <br />
                <strong style="color:#F4F6FB;">
                  Team Maxsas AI
                </strong>
              </p>

            </div>

          </div>
        </body>
      </html>
    `,

    textContent: `
Registration Confirmed — ${webinarTitle}

Hi ${details.fullName},

Your registration and payment have been successfully confirmed.

WORKSHOP DETAILS
Workshop: ${webinarTitle}
Date: ${webinarDate}
Time: ${webinarTime}
Host: ${hostName}

PAYMENT
Status: PAID
Amount: ₹${details.amount.toFixed(2)}
${details.paymentId ? `Payment ID: ${details.paymentId}` : ''}

${zoomLink ? `Join Zoom: ${zoomLink}` : ''}
${whatsappGroupLink ? `Join WhatsApp Group: ${whatsappGroupLink}` : ''}

See you at the workshop!

Team Maxsas AI
    `.trim(),
  };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(
        `Webinar confirmation email sent successfully to ${details.email}`
      );
      return;
    }

    const errorText = await response.text();

    console.error(
      `Brevo API Error (${response.status}):`,
      errorText
    );
  } catch (error) {
    console.error(
      'Error triggering Brevo webinar confirmation email:',
      error
    );
  }
}