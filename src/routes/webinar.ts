import { Router } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { PrismaClient } from '../generated/prisma';
import { requireAdminAccess } from '../middleware/requireAdminAccess';
import { sendMetaPurchaseEvent } from '../services/metaCapiService';
import { sendWebinarEmail } from '../services/notificationService';

const RegistrationStatus = {
  REGISTERED: 'REGISTERED',
  PAID: 'PAID',
} as const;

const WebinarStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

const WebinarConfigStatus = {
  OPEN: 'OPEN',
  SEATS_FULL: 'SEATS_FULL',
  COMPLETED: 'COMPLETED',
} as const;

type WebinarConfigStatusValue = (typeof WebinarConfigStatus)[keyof typeof WebinarConfigStatus];

const router = Router();
const prisma = new PrismaClient();
const WEBINAR_SLUG = 'maxsas-ai-voice-agent-workshop-2026';
const DEFAULT_WEBINAR_DATE = new Date('2026-08-25T16:00:00+05:30');

const DEFAULT_WEBINAR_CONFIG: WebinarConfigRecord = {
  title: 'Maxsas AI Voice Agent Workshop',
  subTitle: 'Live workshop on AI voice agents for real estate teams',
  eventDate: DEFAULT_WEBINAR_DATE,
  eventTime: '4:00 PM IST',
  hostName: 'Anubhav Chaudhary',
  ticketPrice: 19900,
  zoomLink: process.env.ZOOM_WEBINAR_LINK || '',
  whatsappGroupLink: process.env.WHATSAPP_GROUP_LINK || '',
  status: WebinarConfigStatus.OPEN,
};

type WebinarConfigRecord = {
  id?: string;
  title: string;
  subTitle: string;
  eventDate: Date;
  eventTime: string;
  hostName: string;
  ticketPrice: number;
  zoomLink: string;
  whatsappGroupLink: string;
  status: WebinarConfigStatusValue;
  updatedAt?: Date;
};

type WebinarConfigPayload = {
  id: string;
  title: string;
  subTitle: string;
  eventDate: string;
  eventTime: string;
  hostName: string;
  ticketPrice: number;
  zoomLink: string;
  whatsappGroupLink: string;
  status: WebinarConfigStatusValue;
  updatedAt: string;
};

let razorpayClient: Razorpay | null = null;

function resolveRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || process.env.Live_API_Key || '';
}

function resolveRazorpayKeySecret(): string {
  return process.env.RAZORPAY_KEY_SECRET || process.env.Live_Key_Secret || '';
}

function getRazorpayClient(): Razorpay {
  const keyId = resolveRazorpayKeyId();
  const keySecret = resolveRazorpayKeySecret();

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured');
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayClient;
}

function parseDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
}

function parseTicketPrice(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.round(parsed);
  }

  return fallback;
}

function parseStatus(value: unknown): WebinarConfigStatusValue {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (raw === WebinarConfigStatus.SEATS_FULL || raw === WebinarConfigStatus.COMPLETED) {
    return raw;
  }

  return WebinarConfigStatus.OPEN;
}

function isMissingDbTableError(error: any): boolean {
  return Boolean(
    error && (
      error.code === 'P2021' ||
      String(error.message || '').includes('does not exist in the current database') ||
      String(error.message || '').includes('WebinarConfig')
    )
  );
}

function serializeWebinarConfig(config: WebinarConfigRecord): WebinarConfigPayload {
  return {
    id: config.id || 'default',
    title: config.title,
    subTitle: config.subTitle,
    eventDate: config.eventDate.toISOString(),
    eventTime: config.eventTime,
    hostName: config.hostName,
    ticketPrice: config.ticketPrice,
    zoomLink: config.zoomLink,
    whatsappGroupLink: config.whatsappGroupLink,
    status: config.status,
    updatedAt: config.updatedAt ? config.updatedAt.toISOString() : new Date().toISOString(),
  };
}

async function getWebinarConfigRecord(): Promise<WebinarConfigRecord | null> {
  try {
    const record = await prisma.webinarConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    return record
      ? {
          id: record.id,
          title: record.title,
          subTitle: record.subTitle,
          eventDate: record.eventDate,
          eventTime: record.eventTime,
          hostName: record.hostName,
          ticketPrice: record.ticketPrice,
          zoomLink: record.zoomLink,
          whatsappGroupLink: record.whatsappGroupLink,
          status: record.status as WebinarConfigStatusValue,
          updatedAt: record.updatedAt,
        }
      : null;
  } catch (error) {
    if (isMissingDbTableError(error)) {
      return null;
    }
    throw error;
  }
}

async function resolveWebinarConfig(): Promise<WebinarConfigRecord> {
  return (await getWebinarConfigRecord()) || { ...DEFAULT_WEBINAR_CONFIG };
}

async function syncLegacyWebinar(config: WebinarConfigRecord) {
  const existing = await prisma.webinar.findFirst({
    where: { slug: WEBINAR_SLUG },
  });

  const payload: any = {
    slug: WEBINAR_SLUG,
    title: config.title,
    subtitle: config.subTitle,
    date: config.eventDate,
    time: config.eventTime,
    priceInPaise: config.ticketPrice,
    status: config.status === WebinarConfigStatus.OPEN ? WebinarStatus.PUBLISHED : WebinarStatus.ARCHIVED,
    speakerName: config.hostName,
    speakerDesignation: 'Founder & CEO, Maxsas AI',
    speakerExperience: 'AI voice systems for real estate lead qualification',
    speakerImageUrl: null,
    benefits: [],
    agenda: [],
    testimonials: [],
    faqs: [],
    whoShouldAttend: [],
    whatsappGroupLink: config.whatsappGroupLink || null,
    seoTitle: config.title,
    seoDescription: config.subTitle,
    ogImageUrl: null,
    updatedAt: new Date(),
  };

  if (existing) {
    return prisma.webinar.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.webinar.create({
    data: {
      id: crypto.randomUUID(),
      ...payload,
    },
  });
}

async function ensureWebinar() {
  return syncLegacyWebinar(await resolveWebinarConfig());
}

router.get('/config', async (_req: any, res: any): Promise<void> => {
  try {
    const config = await resolveWebinarConfig();
    res.json({ success: true, data: serializeWebinarConfig(config) });
  } catch (error) {
    console.error('Webinar Config Load Error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to load webinar config' } });
  }
});

router.put('/config', requireAdminAccess, async (req: any, res: any): Promise<void> => {
  try {
    const existing = await getWebinarConfigRecord();
    const fallback = existing || DEFAULT_WEBINAR_CONFIG;

    const payload = {
      title: typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : fallback.title,
      subTitle: typeof req.body?.subTitle === 'string' && req.body.subTitle.trim() ? req.body.subTitle.trim() : fallback.subTitle,
      eventDate: parseDate(req.body?.eventDate, fallback.eventDate),
      eventTime: typeof req.body?.eventTime === 'string' && req.body.eventTime.trim() ? req.body.eventTime.trim() : fallback.eventTime,
      hostName: typeof req.body?.hostName === 'string' && req.body.hostName.trim() ? req.body.hostName.trim() : fallback.hostName,
      ticketPrice: parseTicketPrice(req.body?.ticketPrice, fallback.ticketPrice),
      zoomLink: typeof req.body?.zoomLink === 'string' ? req.body.zoomLink.trim() : fallback.zoomLink,
      whatsappGroupLink: typeof req.body?.whatsappGroupLink === 'string' ? req.body.whatsappGroupLink.trim() : fallback.whatsappGroupLink,
      status: parseStatus(req.body?.status),
    };

    let saved: WebinarConfigRecord;
    try {
      if (existing) {
        const updated = await prisma.webinarConfig.update({
          where: { id: existing.id },
          data: payload,
        });
        saved = {
          id: updated.id,
          ...payload,
          updatedAt: updated.updatedAt,
        };
      } else {
        const created = await prisma.webinarConfig.create({
          data: {
            id: crypto.randomUUID(),
            ...payload,
          },
        });
        saved = {
          id: created.id,
          ...payload,
          updatedAt: created.updatedAt,
        };
      }
    } catch (error) {
      if (isMissingDbTableError(error)) {
        saved = {
          ...DEFAULT_WEBINAR_CONFIG,
          ...payload,
          updatedAt: new Date(),
        };
      } else {
        throw error;
      }
    }

    try {
      await syncLegacyWebinar({
        id: saved.id,
        title: saved.title,
        subTitle: saved.subTitle,
        eventDate: saved.eventDate,
        eventTime: saved.eventTime,
        hostName: saved.hostName,
        ticketPrice: saved.ticketPrice,
        zoomLink: saved.zoomLink,
        whatsappGroupLink: saved.whatsappGroupLink,
        status: saved.status,
        updatedAt: saved.updatedAt,
      });
    } catch (error) {
      if (!isMissingDbTableError(error)) {
        console.warn('Webinar legacy sync skipped due to non-table error:', error);
      }
    }

    res.json({ success: true, data: serializeWebinarConfig(saved) });
  } catch (error) {
    console.error('Webinar Config Save Error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to save webinar config' } });
  }
});

// 1. Create Razorpay Order & Register Lead
router.post('/register', async (req: any, res: any): Promise<void> => {
  try {
    const { fullName, phone, email, company, city, monthlyLeads } = req.body as {
      fullName?: string;
      phone?: string;
      email?: string;
      company?: string;
      city?: string;
      monthlyLeads?: string;
    };

    if (!fullName || !phone || !email) {
      return res.status(400).json({ error: 'Name, Phone, and Email are required' });
    }

    const webinar = await ensureWebinar();
    const amount = webinar.priceInPaise;

    const order = await getRazorpayClient().orders.create({
      amount,
      currency: 'INR',
      receipt: `webinar_${Date.now()}`,
    });

    const registration = await prisma.webinarRegistration.create({
      data: {
        webinarId: webinar.id,
        name: fullName,
        phone,
        email,
        company,
        city,
        monthlyLeads,
        status: RegistrationStatus.REGISTERED,
        razorpayOrderId: order.id,
      },
    });

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: resolveRazorpayKeyId(),
      registrationId: registration.id,
    });
  } catch (error) {
    console.error('Webinar Registration Error:', error);
    return res.status(500).json({ error: 'Failed to initiate webinar payment' });
  }
});

// 2. Verify Razorpay Payment Signature
router.post('/verify-payment', async (req: any, res: any): Promise<void> => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', resolveRazorpayKeySecret())
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const registration = await prisma.webinarRegistration.findFirst({
      where: { razorpayOrderId },
      include: { Webinar: true },
    });

    if (!registration) {
      return res.status(404).json({ error: 'Webinar registration not found for this order' });
    }

    const updated = await prisma.webinarRegistration.update({
      where: { id: registration.id },
      data: {
        status: RegistrationStatus.PAID,
        razorpayPaymentId,
        razorpaySignature,
      },
      include: { Webinar: true },
    });

    const amountInRupees = updated.Webinar.priceInPaise / 100;

    await Promise.allSettled([
      sendWebinarEmail({
        fullName: updated.name,
        email: updated.email,
        phone: updated.phone,
        amount: amountInRupees,
      }),
      sendMetaPurchaseEvent({
        fullName: updated.name,
        email: updated.email,
        phone: updated.phone,
        amount: amountInRupees,
        registrationId: updated.id,
      }),
    ]);

    return res.json({ success: true, registration: updated });
  } catch (error) {
    console.error('Payment Verification Error:', error);
    return res.status(500).json({ error: 'Payment verification failed' });
  }
});

export default router;