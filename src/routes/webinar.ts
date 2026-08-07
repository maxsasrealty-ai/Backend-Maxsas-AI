import { Request, Response, Router } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PrismaClient, RegistrationStatus, WebinarStatus } from '../generated/prisma';
import { sendMetaPurchaseEvent } from '../services/metaCapiService';
import { sendWebinarEmail } from '../services/notificationService';

const router = Router();
const prisma = new PrismaClient();
const WEBINAR_SLUG = 'maxsas-ai-voice-agent-workshop-2026';
const WEBINAR_TITLE = 'Maxsas AI Voice Agent Workshop';

function resolveRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || process.env.Live_API_Key || '';
}

function resolveRazorpayKeySecret(): string {
  return process.env.RAZORPAY_KEY_SECRET || process.env.Live_Key_Secret || '';
}

async function ensureWebinar() {
  const existing = await prisma.webinar.findFirst({
    where: { slug: WEBINAR_SLUG },
  });

  if (existing) {
    return existing;
  }

  return prisma.webinar.create({
    data: {
      id: crypto.randomUUID(),
      slug: WEBINAR_SLUG,
      title: WEBINAR_TITLE,
      subtitle: 'Live workshop on AI voice agents for real estate teams',
      date: new Date('2026-08-25T16:00:00+05:30'),
      time: '4:00 PM IST',
      priceInPaise: 19900,
      status: WebinarStatus.PUBLISHED,
      speakerName: 'Anubhav Chaudhary',
      speakerDesignation: 'Founder & CEO, Maxsas AI',
      speakerExperience: 'AI voice systems for real estate lead qualification',
      speakerImageUrl: null,
      benefits: [],
      agenda: [],
      testimonials: [],
      faqs: [],
      whoShouldAttend: [],
      whatsappGroupLink: process.env.WHATSAPP_GROUP_LINK || null,
      seoTitle: 'Maxsas AI Voice Agent Workshop',
      seoDescription: 'Learn how to qualify real estate leads with AI voice agents.',
      ogImageUrl: null,
      updatedAt: new Date(),
    },
  });
}

let razorpayClient: Razorpay | null = null;

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

    const amount = 19900; // 199 INR in paise
    const webinar = await ensureWebinar();

    // Create Razorpay Order
    const order = await getRazorpayClient().orders.create({
      amount,
      currency: 'INR',
      receipt: `webinar_${Date.now()}`,
    });

    // Save initial registration state to DB
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

    // Update status in DB
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