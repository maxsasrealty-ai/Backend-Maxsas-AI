import crypto from 'crypto';

interface PurchaseData {
  email: string;
  phone: string;
  fullName: string;
  amount: number; // in INR
  registrationId: string;
}

export async function sendMetaPurchaseEvent(data: PurchaseData) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.log('Meta Pixel ID or Access Token missing, skipping CAPI event.');
    return;
  }

  // Hash user data using SHA-256 (Required by Meta Privacy Policy)
  const hash = (value: string) =>
    crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');

  // Format phone number to E.164 (e.g. 919876543210)
  const cleanPhone = data.phone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_id: `webinar_${data.registrationId}`, // For Deduplication with Client Pixel
        user_data: {
          em: [hash(data.email)],
          ph: [hash(formattedPhone)],
          fn: [hash(data.fullName.split(' ')[0] || '')],
        },
        custom_data: {
          currency: 'INR',
          value: data.amount,
          content_name: 'Maxsas AI Voice Agent Workshop Registration',
        },
      },
    ],
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    if (response.ok) {
      console.log('Meta CAPI Purchase Event tracked successfully:', result);
    } else {
      console.error('Meta CAPI Error:', result);
    }
  } catch (error) {
    console.error('Failed to trigger Meta CAPI event:', error);
  }
}