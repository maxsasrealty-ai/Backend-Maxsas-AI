import crypto from 'crypto';
import { config } from '../lib/config';

interface PurchaseData {
  email: string;
  phone: string;
  fullName: string;
  amount: number; // in INR
  registrationId: string;
}

export async function sendMetaPurchaseEvent(data: PurchaseData) {
  const pixelId = config.META_PIXEL_ID;
  const accessToken = config.META_CAPI_ACCESS_TOKEN;
  const eventId = `webinar_${data.registrationId}`;

  if (!pixelId || !accessToken) {
    console.warn('Meta CAPI Purchase skipped: META_PIXEL_ID or META_CAPI_ACCESS_TOKEN is not configured.');
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
        event_id: eventId,
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
      `https://graph.facebook.com/${config.META_GRAPH_API_VERSION}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (response.ok) {
      console.info('Meta CAPI Purchase sent successfully.', {
        eventId,
        status: response.status,
      });
    } else {
      console.error('Meta CAPI Purchase failed.', {
        eventId,
        status: response.status,
      });
    }
  } catch (error) {
    console.error('Meta CAPI Purchase request failed.', {
      eventId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}