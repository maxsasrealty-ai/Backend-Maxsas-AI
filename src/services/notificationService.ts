interface RegistrationDetails {
  fullName: string;
  email: string;
  phone: string;
  amount: number;
}

export async function sendWebinarEmail(details: RegistrationDetails) {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const zoomLink = process.env.ZOOM_WEBINAR_LINK || 'https://zoom.us/j/your-webinar-id';
  const whatsappGroupLink = process.env.WHATSAPP_GROUP_LINK || 'https://chat.whatsapp.com/your-group-invite';

  if (!brevoApiKey) {
    console.log('Brevo API key missing in .env, skipping email.');
    return;
  }

  const payload = {
    sender: {
      name: 'Maxsas AI',
      email: process.env.SENDER_EMAIL || 'info@maxsasrealty.ai',
    },
    to: [
      {
        email: details.email,
        name: details.fullName,
      },
    ],
    subject: '🎉 Confirmation: Maxsas AI Voice Agent Workshop Registration',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; background-color: #06080F; color: #F4F6FB; padding: 24px; border-radius: 12px;">
        <h2 style="color: #3B6FFF;">Registration Confirmed!</h2>
        <p>Hi <strong>${details.fullName}</strong>,</p>
        <p>Thank you for registering for the <strong>Maxsas AI Voice Agent Workshop</strong>!</p>
        
        <div style="background-color: #0E1220; padding: 16px; border-radius: 8px; border: 1px solid #232A44; margin: 20px 0;">
          <p style="margin: 6px 0;"><strong>📅 Date & Time:</strong> Thursday, 25 Aug 2026 at 4:00 PM IST</p>
          <p style="margin: 6px 0;"><strong>🎙️ Host:</strong> Anubhav Chaudhary (Founder & CEO, Maxsas AI)</p>
          <p style="margin: 6px 0;"><strong>💰 Payment Status:</strong> Paid (₹${details.amount})</p>
        </div>

        <p><strong>Access Links:</strong></p>
        <ul style="line-height: 1.8;">
          <li><a href="${zoomLink}" style="color: #5B87FF; font-weight: bold;">Join Zoom Webinar</a></li>
          <li><a href="${whatsappGroupLink}" style="color: #25D366; font-weight: bold;">Join VIP WhatsApp Group</a></li>
        </ul>

        <p style="margin-top: 24px; color: #8D96B3; font-size: 13px;">See you at the workshop!<br>Team Maxsas AI</p>
      </div>
    `,
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`Brevo confirmation email sent successfully to ${details.email}`);
    } else {
      const errData = await res.json();
      console.error('Brevo API Error:', errData);
    }
  } catch (error) {
    console.error('Error triggering Brevo email:', error);
  }
}