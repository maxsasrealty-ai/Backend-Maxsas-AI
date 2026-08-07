import crypto from "crypto";
import Razorpay from "razorpay";
import { Prisma } from "../generated/prisma";
import {
    CreateOrderResponse,
    WalletBalanceResponse,
    WalletTransactionItem,
    WalletTransactionsResponse,
} from "../../shared/contracts";
import {
    creditWalletBalance,
    findTransactionByProviderOrderId,
    formatPaise,
    getWalletBalance,
    insertTransaction,
    listWalletTransactions,
    markTransactionCompleted,
    markTransactionFailed,
    processIdempotentDebit
} from "../repositories/walletRepository";
  import { config } from "../lib/config";

// ─── Razorpay client (lazy, mock-safe) ───────────────────────────────────

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const FORCE_LOCAL_MOCK = config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects;
const MOCK_MODE = FORCE_LOCAL_MOCK || !RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET;

let _razorpay: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!_razorpay) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured");
    }
    _razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return _razorpay;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatTransaction(item: {
  id: string;
  tenantId: string;
  type: string;
  amountPaise: number;
  description: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  status: string;
  createdAt: Date;
}): WalletTransactionItem {
  return {
    id: item.id,
    tenantId: item.tenantId,
    type: item.type as "credit" | "debit",
    amountPaise: item.amountPaise,
    amountFormatted: formatPaise(item.amountPaise),
    description: item.description,
    provider: item.provider,
    providerOrderId: item.providerOrderId,
    providerPaymentId: item.providerPaymentId,
    status: item.status as "pending" | "completed" | "failed",
    createdAt: item.createdAt.toISOString(),
  };
}

async function finalizeRazorpayTopUp(args: {
  tenantId: string;
  providerOrderId: string;
  providerPaymentId?: string;
}): Promise<boolean> {
  // Only the first successful transition from pending -> success is allowed to credit the wallet.
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const pendingLedger = await tx.walletLedger.findFirst({
      where: {
        tenantId: args.tenantId,
        referenceId: args.providerOrderId,
        status: "pending",
      },
    });

    if (!pendingLedger) {
      return false;
    }

    const transition = await tx.walletLedger.updateMany({
      where: {
        tenantId: args.tenantId,
        referenceId: args.providerOrderId,
        status: "pending",
      },
      data: {
        status: "success",
        ...(args.providerPaymentId ? { externalTxnId: args.providerPaymentId } : {}),
      },
    });

    if (transition.count === 0) {
      return false;
    }

    await tx.walletAccount.update({
      where: { id: pendingLedger.walletAccountId },
      data: {
        currentBalanceMinor: {
          increment: pendingLedger.amountMinor,
        },
      },
    });

    await tx.tenant.update({
      where: { id: args.tenantId },
      data: {
        walletBalancePaise: {
          increment: Number(pendingLedger.amountMinor),
        },
      },
    });

    return true;
  });
}

// ─── Create payment order ─────────────────────────────────────────────────

const MIN_AMOUNT_PAISE = 5000; // ₹50 minimum
const MAX_AMOUNT_PAISE = 1_000_000_00; // ₹10,00,000 maximum

export async function createTopUpOrder(
  tenantId: string,
  amountPaise: number
): Promise<CreateOrderResponse> {
  if (amountPaise < MIN_AMOUNT_PAISE) {
    throw new Error(`Minimum top-up amount is ${formatPaise(MIN_AMOUNT_PAISE)}`);
  }
  if (amountPaise > MAX_AMOUNT_PAISE) {
    throw new Error(`Maximum top-up amount is ${formatPaise(MAX_AMOUNT_PAISE)}`);
  }

  // Mock mode — no real Razorpay keys needed for local dev/testing
  if (MOCK_MODE) {
    const mockOrderId = `mock_order_${Date.now()}`;
    await insertTransaction({
      tenantId,
      type: "credit",
      amountPaise,
      description: `Wallet top-up ${formatPaise(amountPaise)} (mock)`,
      provider: "mock",
      providerOrderId: mockOrderId,
      status: "completed",
    });
    await creditWalletBalance(tenantId, amountPaise);
    return {
      orderId: mockOrderId,
      amountPaise,
      mock: true,
    };
  }

  const rzp = getRazorpay();
  const receiptId = `rcpt_${tenantId.slice(0,8)}_${Date.now()}`;
  
  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: receiptId,
    notes: { tenantId },
  });

  await insertTransaction({
    tenantId,
    type: "credit",
    amountPaise,
    description: `Wallet top-up ${formatPaise(amountPaise)}`,
    provider: "razorpay",
    providerOrderId: order.id,
    status: "pending",
  });

  return {
    orderId: order.id,
    amountPaise,
    mock: false,
  };
}

// ─── Verify Payment Signature ─────────────────────────────────────────────

export async function verifyRazorpayPayment(
  tenantId: string,
  orderId: string,
  paymentId: string,
  signature: string
): Promise<boolean> {
  if (MOCK_MODE) {
    // If we're mocking, we shouldn't really hit this with real signatures,
    // but just in case frontend sends it
    return true;
  }

  if (!RAZORPAY_KEY_SECRET) {
    throw new Error("Missing RAZORPAY_KEY_SECRET");
  }

  const payload = orderId + "|" + paymentId;
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest("hex");

  if (expectedSignature !== signature) {
    throw new Error("Invalid payment signature");
  }

  // Valid signature, complete the transaction synchronously
  await finalizeRazorpayTopUp({
    tenantId,
    providerOrderId: orderId,
    providerPaymentId: paymentId,
  });

  return true;
}

// ─── Webhook handler ──────────────────────────────────────────────────────

export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string
): Promise<{ received: boolean; eventType: string }> {
  if (MOCK_MODE || !RAZORPAY_WEBHOOK_SECRET) {
    return { received: true, eventType: "mock.skip" };
  }

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    throw new Error("Webhook signature verification failed");
  }

  const event = JSON.parse(rawBody);

  switch (event.event) {
    case "payment.captured": {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      if (!orderId) break;

      const tenantIdFromNotes = String(payment?.notes?.tenantId || "").trim();
      if (!tenantIdFromNotes) break;

      await finalizeRazorpayTopUp({
        tenantId: tenantIdFromNotes,
        providerOrderId: orderId,
        providerPaymentId: payment.id,
      });
      break;
    }
    case "payment.failed": {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      if (orderId) {
        const tenantIdFromNotes = String(payment?.notes?.tenantId || "").trim();
        if (tenantIdFromNotes) {
          await markTransactionFailed(tenantIdFromNotes, orderId);
        }
      }
      break;
    }
    default:
      break;
  }

  return { received: true, eventType: event.event };
}

// ─── Balance ──────────────────────────────────────────────────────────────

export async function fetchWalletBalance(
  tenantId: string
): Promise<WalletBalanceResponse> {
  const balancePaise = await getWalletBalance(tenantId);
  return {
    tenantId,
    balancePaise,
    balanceFormatted: formatPaise(balancePaise),
  };
}

// ─── Transactions ─────────────────────────────────────────────────────────

export async function fetchWalletTransactions(
  tenantId: string,
  page: number,
  pageSize: number
): Promise<WalletTransactionsResponse> {
  const { items, totalItems } = await listWalletTransactions(tenantId, page, pageSize);
  return {
    items: items.map(formatTransaction),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

// ─── Debit (for call-cost tracking) ───────────────────────────────────────

export const DEFAULT_CALL_DEBIT_PAISE = 1000; // ₹10 testing rate

export async function debitWalletForCall(
  tenantId: string,
  amountPaise: number,
  callId: string
): Promise<{ success: boolean; reason: string }> {
  const referenceId = `call_debit_${callId}`;
  
  // Use atomic wallet repository logic
  const result = await processIdempotentDebit({
    tenantId,
    amountPaise,
    description: `AI call usage — ${callId}`,
    referenceId,
  });

  return { success: result.success, reason: result.reason };
}

// ─── Verification Recovery ───────────────────────────────────────────────

export async function syncRazorpayOrderStatus(orderId: string): Promise<{ success: boolean; status: string }> {
  if (MOCK_MODE) {
    return { success: true, status: "mock_completed" };
  }

  try {
    const rzp = getRazorpay();
    const order = await rzp.orders.fetch(orderId);
    
    if (order.status === "paid") {
      const tenantIdFromNotes = String(order?.notes?.tenantId || "").trim();
      const existing = tenantIdFromNotes
        ? await findTransactionByProviderOrderId(tenantIdFromNotes, orderId)
        : null;
      if (existing && existing.status === "pending") {
        // Find the payments for this order
        const payments = await rzp.orders.fetchPayments(orderId);
        const capturedPayment = payments.items.find(p => p.status === "captured");
        
        if (capturedPayment) {
          await finalizeRazorpayTopUp({
            tenantId: existing.tenantId,
            providerOrderId: orderId,
            providerPaymentId: capturedPayment.id,
          });
          return { success: true, status: "recovered_paid" };
        }
      }
      return { success: true, status: "already_paid" };
    }
    
    return { success: false, status: order.status };
  } catch (err) {
    return { success: false, status: "error" };
  }
}
