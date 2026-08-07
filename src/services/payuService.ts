/// <reference path="../types/node-shims.d.ts" />

import * as crypto from "crypto";
import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { normalizeTenantId } from "../lib/tenant-id";
import { assertUuid } from "../lib/uuid";
import { getOrCreateWalletAccount } from "../repositories/walletLedgerRepository";

/**
 * PayU Payment Service (Test and Live Mode)
 * 
 * Handles PayU payment processing with proper tenant isolation, atomic ledger creation,
 * and idempotent webhook/return handling. Supports both test and live modes.
 * 
 * Environment Variables:
 * - PAYU_MODE: "test" (default) or "live"
 * - PAYU_KEY: PayU merchant key (test: D0Fjcc)
 * - PAYU_SALT: PayU merchant salt for hash generation
 * - PAYU_TEST_CHECKOUT_URL: PayU test checkout endpoint (default: https://test.payu.in/_payment)
 * - PAYU_LIVE_CHECKOUT_URL: PayU live checkout endpoint (default: https://secure.payu.in/_payment)
 * - PAYU_VERIFY_URL: PayU payment verification endpoint
 * - PAYU_WEBHOOK_SECRET: Secret for webhook signature verification (optional)
 */

// Determine mode: production env uses live if not explicitly set to test
const PAYU_MODE = (process.env.APP_ENV === "production" && process.env.PAYU_MODE !== "test")
  ? "live"
  : process.env.PAYU_MODE || "test";

const PAYU_KEY = process.env.PAYU_KEY || (PAYU_MODE === "test" ? "D0Fjcc" : "");
const PAYU_SALT = process.env.PAYU_SALT || (PAYU_MODE === "test" ? "Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ" : "");
const PAYU_WEBHOOK_SECRET = process.env.PAYU_WEBHOOK_SECRET || "";

if (!PAYU_KEY || !PAYU_SALT) {
  throw new Error(
    `PayU credentials missing for mode '${PAYU_MODE}'. ` +
    `Set PAYU_KEY and PAYU_SALT environment variables.`
  );
}

// PayU API endpoints
const PAYU_TEST_URL = process.env.PAYU_TEST_CHECKOUT_URL || "https://test.payu.in/_payment";
const PAYU_LIVE_URL = process.env.PAYU_LIVE_CHECKOUT_URL || "https://secure.payu.in/_payment";
const PAYU_VERIFY_URL = process.env.PAYU_VERIFY_URL || 
  (PAYU_MODE === "live" ? "https://secure.payu.in/payment/verify" : "https://test.payu.in/payment/verify");

// ─── TYPE DEFINITIONS ────────────────────────────────────────────────────

export interface PayUInitiationRequest {
  tenantId: string;
  userId: string;
  amount: number; // in paise
  description: string;
  email: string;
  phoneNumber: string;
  successUrl: string;
  failureUrl: string;
  metadata?: Record<string, unknown>;
}

export interface PayUInitiationResponse {
  paymentOrderId: string;
  merchantTransactionId: string;
  payuKey: string;
  hash: string;
  amount: number;
  email: string;
  phoneNumber: string;
  description: string;
  payuMode: string;
  payuUrl: string;
  successUrl: string;
  failureUrl: string;
}

export interface PayUWebhookPayload {
  status: string;
  mihpayid: string;
  mode: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  [key: string]: unknown;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────

export function generatePayUHash(
  transactionId: string,
  amount: string,
  productInfo: string,
  firstName: string,
  email: string,
  salt: string = PAYU_SALT
): string {
  // PayU test gateway expects exactly this empty-field expansion after email.
  const hashString = `${PAYU_KEY}|${transactionId}|${amount}|${productInfo}|${firstName}|${email}|||||||||||${salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

export function verifyPayUHash(
  hash: string,
  transactionId: string,
  amount: string,
  productInfo: string,
  firstName: string,
  email: string,
  salt: string = PAYU_SALT
): boolean {
  const expectedHash = generatePayUHash(transactionId, amount, productInfo, firstName, email, salt);
  return hash === expectedHash;
}

export function generateMerchantTransactionId(tenantId: string): string {
  // Format: txn_<tenant-abbr>_<timestamp>_<random>
  const tenantAbbr = tenantId.substring(0, 8);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `txn_${tenantAbbr}_${timestamp}_${random}`;
}

export function buildWalletTopUpDescription(amountMinor: number): string {
  if (PAYU_MODE === "live") {
    return "Wallet top-up";
  }

  return `Wallet top-up initiated via PayU (₹${amountMinor / 100})`;
}

async function finalizeSuccessfulTopUp(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    paymentOrderId: string;
    walletAccountId: string | null;
    amountMinor: bigint;
    merchantTransactionId: string;
    payuTransactionId: string;
  }
): Promise<{ orderStatus: string; balanceUpdated: boolean }> {
  // Only the first transaction that transitions the payment order out of a final state is allowed
  // to create the success ledger and increment the wallet balance.
  const transition = await tx.paymentOrder.updateMany({
    where: {
      id: args.paymentOrderId,
      tenantId: args.tenantId,
      status: {
        notIn: ["success", "failed"],
      },
    },
    data: {
      status: "success",
      payuTxnId: args.payuTransactionId,
    },
  });

  const currentOrder = await tx.paymentOrder.findUnique({
    where: { id: args.paymentOrderId },
    select: { status: true },
  });

  if (transition.count === 0 || !args.walletAccountId) {
    return {
      orderStatus: currentOrder?.status ?? "unknown",
      balanceUpdated: false,
    };
  }

  const idempotencyKey = `ledger_${args.paymentOrderId}`;
  const existingLedger = await tx.walletLedger.findUnique({
    where: {
      walletAccountId_idempotencyKey: {
        walletAccountId: args.walletAccountId,
        idempotencyKey,
      },
    },
  });

  let balanceUpdated = false;
  let newBalancePaise: number | undefined;

  if (existingLedger) {
    if (existingLedger.status !== "success") {
      await tx.walletLedger.update({
        where: { id: existingLedger.id },
        data: {
          status: "success",
          paymentOrderId: args.paymentOrderId,
          externalTxnId: args.payuTransactionId,
          referenceType: "payu",
          referenceId: args.merchantTransactionId,
        },
      });
      balanceUpdated = true;
    }
  } else {
    await tx.walletLedger.create({
      data: {
        tenantId: args.tenantId,
        walletAccountId: args.walletAccountId,
        direction: "credit",
        amountMinor: args.amountMinor,
        currency: "INR",
        status: "success",
        entryType: "wallet_topup",
        paymentOrderId: args.paymentOrderId,
        externalTxnId: args.payuTransactionId,
        referenceType: "payu",
        referenceId: args.merchantTransactionId,
        description: buildWalletTopUpDescription(Number(args.amountMinor)),
        idempotencyKey,
      },
    });
    balanceUpdated = true;
  }

  if (balanceUpdated) {
    const updatedWallet = await tx.walletAccount.update({
      where: { id: args.walletAccountId },
      data: {
        currentBalanceMinor: {
          increment: args.amountMinor,
        },
      },
    });

    await tx.tenant.update({
      where: { id: args.tenantId },
      data: {
        walletBalancePaise: {
          increment: Number(args.amountMinor),
        },
      },
    });

    newBalancePaise = Number(updatedWallet.currentBalanceMinor);
  }

  return {
    orderStatus: currentOrder?.status ?? "success",
    balanceUpdated,
    newBalancePaise,
  };
}

async function markFailedTopUp(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    paymentOrderId: string;
    walletAccountId: string | null;
    merchantTransactionId: string;
    payuTransactionId: string;
  }
): Promise<{ orderStatus: string }> {
  // Failed callbacks are only allowed to move a non-final order into failed.
  await tx.paymentOrder.updateMany({
    where: {
      id: args.paymentOrderId,
      tenantId: args.tenantId,
      status: {
        notIn: ["success", "failed"],
      },
    },
    data: {
      status: "failed",
      payuTxnId: args.payuTransactionId,
    },
  });

  if (args.walletAccountId) {
    await tx.walletLedger.updateMany({
      where: {
        walletAccountId: args.walletAccountId,
        idempotencyKey: `ledger_${args.paymentOrderId}`,
        status: "pending",
      },
      data: {
        status: "failed",
        externalTxnId: args.payuTransactionId,
        referenceType: "payu",
        referenceId: args.merchantTransactionId,
      },
    });
  }

  const currentOrder = await tx.paymentOrder.findUnique({
    where: { id: args.paymentOrderId },
    select: { status: true },
  });

  return {
    orderStatus: currentOrder?.status ?? "unknown",
  };
}

// ─── INITIATE PAYMENT ────────────────────────────────────────────────────

export async function initiatePaymentOrder(
  req: PayUInitiationRequest
): Promise<PayUInitiationResponse> {
  const tenantId = normalizeTenantId(req.tenantId);
  assertUuid(tenantId, "tenantId");

  // Validate amount
  if (req.amount < 1000) {
    throw new Error("Minimum payment amount is ₹10");
  }
  if (req.amount > 10000000) {
    throw new Error("Maximum payment amount is ₹1,00,000");
  }

  // Normalize phone number (must be numeric)
  const phoneNumber = req.phoneNumber.replace(/\D/g, "");
  if (!phoneNumber || phoneNumber.length < 10) {
    throw new Error("Invalid phone number");
  }

  const metadataJson = req.metadata ?? {};

  // Generate merchant transaction ID
  const merchantTxnId = generateMerchantTransactionId(tenantId);
  const { paymentOrder } = await prisma.$transaction(async (tx) => {
    const walletAccount = await getOrCreateWalletAccount(tenantId, req.userId, tx);

    const paymentOrder = await tx.paymentOrder.create({
      data: {
        tenantId,
        userId: req.userId,
        walletAccountId: walletAccount.id,
        amountMinor: BigInt(req.amount),
        currency: "INR",
        purpose: "wallet_topup",
        provider: "payu",
        providerMode: PAYU_MODE === "test" ? "test" : "live",
        status: "created",
        merchantTxnId,
        successUrl: req.successUrl,
        failureUrl: req.failureUrl,
        metaJson: metadataJson as any,
      },
    });

    await tx.walletLedger.create({
      data: {
        tenantId,
        walletAccountId: paymentOrder.walletAccountId,
        direction: "credit",
        amountMinor: BigInt(req.amount),
        currency: "INR",
        status: "pending",
        entryType: "wallet_topup",
        paymentOrderId: paymentOrder.id,
        referenceType: "payu",
        referenceId: merchantTxnId,
        description: buildWalletTopUpDescription(req.amount),
        metaJson: {
          source: "payu_initiate",
          paymentOrderId: paymentOrder.id,
          merchantTxnId,
        },
        idempotencyKey: `ledger_${paymentOrder.id}`,
      },
    });

    const firstName = req.email.split("@")[0];
    const amountRupees = (req.amount / 100).toFixed(2);

    await tx.paymentAttempt.create({
      data: {
        tenantId,
        paymentOrderId: paymentOrder.id,
        provider: "payu",
        providerMode: PAYU_MODE === "test" ? "test" : "live",
        status: "initiated",
        requestPayloadJson: {
          key: PAYU_KEY,
          txnid: merchantTxnId,
          amount: amountRupees,
          productinfo: "wallet_topup",
          firstname: firstName,
          email: req.email,
          phone: phoneNumber,
          successUrl: req.successUrl,
          failureUrl: req.failureUrl,
        },
      },
    });

    return { paymentOrder };
  });

  // Generate PayU hash only after the database state is safely recorded.
  const firstName = req.email.split("@")[0];
  const amountRupees = (req.amount / 100).toFixed(2);

  const hash = generatePayUHash(
    merchantTxnId,
    amountRupees,
    "wallet_topup",
    firstName,
    req.email
  );

  const payuUrl = PAYU_MODE === "live" ? PAYU_LIVE_URL : PAYU_TEST_URL;
  const formFields = {
    key: PAYU_KEY,
    txnid: merchantTxnId,
    amount: amountRupees,
    productinfo: "wallet_topup",
    firstname: firstName,
    email: req.email,
    phone: phoneNumber,
    hash,
    surl: req.successUrl,
    furl: req.failureUrl,
    service_provider: "payu_paisa",
  };

  logger.info("PayU initiate payload prepared", {
    tenantId,
    paymentOrderId: paymentOrder.id,
    merchantTransactionId: merchantTxnId,
    payuMode: PAYU_MODE,
    payuUrl,
    payuUrlIsOfficialTestEndpoint: payuUrl === PAYU_TEST_URL,
    payuUrlIsOfficialLiveEndpoint: payuUrl === PAYU_LIVE_URL,
    amountPaise: req.amount,
    amountRupees: req.amount / 100,
    successUrl: req.successUrl,
    failureUrl: req.failureUrl,
    successUrlIsAbsolute: /^https?:\/\//i.test(req.successUrl),
    failureUrlIsAbsolute: /^https?:\/\//i.test(req.failureUrl),
    requestPayloadJson: {
      key: PAYU_KEY,
      txnid: merchantTxnId,
      amount: amountRupees,
      productinfo: "wallet_topup",
      firstname: firstName,
      email: req.email,
      phone: phoneNumber,
      successUrl: req.successUrl,
      failureUrl: req.failureUrl,
    },
    formFields,
  });

  return {
    paymentOrderId: paymentOrder.id,
    merchantTransactionId: merchantTxnId,
    payuKey: PAYU_KEY,
    hash,
    amount: req.amount,
    email: req.email,
    phoneNumber,
    description: req.description,
    payuMode: PAYU_MODE,
    payuUrl,
    successUrl: req.successUrl,
    failureUrl: req.failureUrl,
  };
}

// ─── VERIFY PAYMENT (FROM REDIRECT) ──────────────────────────────────────

export interface PayURedirectVerificationRequest {
  tenantId: string;
  paymentOrderId: string;
  merchantTransactionId: string;
  payuTransactionId: string; // mihpayid from response
  status: string; // success, failed, pending
}

export async function verifyPaymentFromRedirect(
  req: PayURedirectVerificationRequest
): Promise<{
  success: boolean;
  finalized: boolean;
  message: string;
  orderStatus?: string;
  paymentOrderId?: string;
  merchantTransactionId?: string;
  balanceUpdated?: boolean;
  newBalancePaise?: number;
  newBalanceFormatted?: string;
}> {
  const tenantId = normalizeTenantId(req.tenantId);
  assertUuid(tenantId, "tenantId");

  // Fetch payment order
  const paymentOrder = await prisma.paymentOrder.findUnique({
    where: { id: req.paymentOrderId },
  });

  if (!paymentOrder || paymentOrder.tenantId !== tenantId) {
    return {
      success: false,
      finalized: false,
      message: "Payment order not found or access denied",
    };
  }

  // Check merchant txn ID match
  if (paymentOrder.merchantTxnId !== req.merchantTransactionId) {
    return {
      success: false,
      finalized: false,
      message: "Transaction ID mismatch",
    };
  }

  const attemptStatus: "pending" | "failed" =
    req.status === "success" ? "pending" : "failed";

  const existingAttempt = await prisma.paymentAttempt.findFirst({
    where: {
      paymentOrderId: paymentOrder.id,
      status: {
        in: ["initiated", "pending"],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingAttempt) {
    await prisma.paymentAttempt.update({
      where: { id: existingAttempt.id },
      data: {
        providerPaymentId: req.merchantTransactionId,
        providerTxnId: req.payuTransactionId,
        responsePayloadJson: {
          merchantTransactionId: req.merchantTransactionId,
          payuTransactionId: req.payuTransactionId,
          status: req.status,
        },
        status: attemptStatus,
      },
    });
  } else {
    await prisma.paymentAttempt.create({
      data: {
        tenantId,
        paymentOrderId: paymentOrder.id,
        provider: "payu",
        providerMode: paymentOrder.providerMode,
        providerPaymentId: req.merchantTransactionId,
        providerTxnId: req.payuTransactionId,
        requestPayloadJson: {
          merchantTransactionId: req.merchantTransactionId,
        },
        responsePayloadJson: {
          merchantTransactionId: req.merchantTransactionId,
          payuTransactionId: req.payuTransactionId,
          status: req.status,
        },
        status: attemptStatus,
      },
    });
  }

  const nextOrderStatus =
    paymentOrder.status === "success" || paymentOrder.status === "failed"
      ? paymentOrder.status
      : req.status === "success"
        ? "pending"
        : "failed";

  const updatedPaymentOrder = await prisma.paymentOrder.update({
    where: { id: paymentOrder.id },
    data: {
      payuTxnId: paymentOrder.payuTxnId || req.payuTransactionId,
      status: nextOrderStatus,
    },
  });

  const finalized = updatedPaymentOrder.status === "success";
  const accepted = req.status === "success";

  // If status indicates success, attempt to finalize the payment immediately
  if (accepted && !finalized) {
    const txResult = await prisma.$transaction((tx) =>
      finalizeSuccessfulTopUp(tx, {
        tenantId,
        paymentOrderId: paymentOrder.id,
        walletAccountId: paymentOrder.walletAccountId,
        amountMinor: paymentOrder.amountMinor,
        merchantTransactionId: req.merchantTransactionId,
        payuTransactionId: req.payuTransactionId,
      })
    );

    const message = txResult.balanceUpdated
      ? "Payment finalized and balance updated"
      : "Payment finalized (no balance change)";

    return {
      success: true,
      finalized: true,
      message,
      orderStatus: txResult.orderStatus,
      paymentOrderId: paymentOrder.id,
      merchantTransactionId: paymentOrder.merchantTxnId ?? undefined,
      balanceUpdated: txResult.balanceUpdated,
      newBalancePaise: txResult.newBalancePaise,
      newBalanceFormatted: txResult.newBalancePaise
        ? `₹${(txResult.newBalancePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : undefined,
    };
  }

  if (!accepted) {
    await prisma.$transaction((tx) =>
      markFailedTopUp(tx, {
        tenantId,
        paymentOrderId: paymentOrder.id,
        walletAccountId: paymentOrder.walletAccountId,
        merchantTransactionId: req.merchantTransactionId,
        payuTransactionId: req.payuTransactionId,
      })
    );
  }

  const message = finalized
    ? "Payment already finalized"
    : accepted
      ? "Payment callback received. Waiting for final confirmation."
      : `Payment ${req.status}`;

  return {
    success: accepted,
    finalized,
    message,
    orderStatus: updatedPaymentOrder.status,
    paymentOrderId: updatedPaymentOrder.id,
    merchantTransactionId: updatedPaymentOrder.merchantTxnId ?? undefined,
    balanceUpdated: false,
  };
}

// ─── PROCESS WEBHOOK ────────────────────────────────────────────────────

export async function processPayUWebhook(
  rawBody: string,
  headerHash: string
): Promise<{ success: boolean; message: string; tenantId?: string }> {
  // Parse the webhook payload
  const payload = JSON.parse(rawBody) as PayUWebhookPayload;

  // Generate idempotency key from webhook data
  const idempotencyKey = `payu_${payload.mihpayid}_${payload.txnid}`;

  // Check if we've already processed this webhook
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { idempotencyKey },
  });

  if (existing && existing.processingStatus === "processed") {
    logger.info("PayU webhook already processed (duplicate detection)", {
      idempotencyKey,
      webhookId: existing.id,
    });
    return {
      success: true,
      message: "Webhook already processed",
    };
  }

  if (existing && existing.processingStatus !== "failed") {
    logger.info("PayU webhook already received (duplicate in-flight detection)", {
      idempotencyKey,
      webhookId: existing.id,
      processingStatus: existing.processingStatus,
    });

    return {
      success: true,
      message: "Webhook already received",
    };
  }

  // Store the raw webhook event once so retries and duplicate callbacks can be correlated safely.
  let webhookEvent;

  try {
    webhookEvent = await prisma.paymentWebhookEvent.create({
      data: {
        provider: "payu",
        eventType: "payment_status",
        providerEventId: payload.mihpayid as string,
        providerTxnId: payload.txnid as string,
        rawBodyJson: payload as any,
        normalizedBodyJson: payload as any,
        processingStatus: "received",
        idempotencyKey,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logger.info("PayU webhook create skipped due to duplicate idempotency key", {
        idempotencyKey,
      });

      return {
        success: true,
        message: "Webhook already received",
      };
    }

    throw error;
  }

  try {
    // Find the payment order by merchant txn ID
    const merchantTxnId = payload.txnid as string;
    const paymentOrder = await prisma.paymentOrder.findFirst({
      where: {
        merchantTxnId,
      },
    });

    if (!paymentOrder) {
      // Update webhook as unresolved but mark as processed
      await prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processingStatus: "processed",
          processingError: "Payment order not found",
        },
      });

      return {
        success: false,
        message: "Payment order not found for transaction",
      };
    }

    const tenantId = paymentOrder.tenantId;

    // Update webhook with tenant resolution
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: { tenantId },
    });

    // Process based on status
    const payuStatus = payload.status as string;

    const attemptStatus: "success" | "failed" =
      payuStatus === "success" ? "success" : "failed";

    const existingAttempt = await prisma.paymentAttempt.findFirst({
      where: {
        paymentOrderId: paymentOrder.id,
        status: {
          in: ["initiated", "pending"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingAttempt) {
      await prisma.paymentAttempt.update({
        where: { id: existingAttempt.id },
        data: {
          providerPaymentId: payload.txnid as string,
          providerTxnId: payload.mihpayid as string,
          responsePayloadJson: payload as any,
          status: attemptStatus,
        },
      });
    } else {
      await prisma.paymentAttempt.create({
        data: {
          tenantId,
          paymentOrderId: paymentOrder.id,
          provider: "payu",
          providerMode: paymentOrder.providerMode,
          providerPaymentId: payload.txnid as string,
          providerTxnId: payload.mihpayid as string,
          requestPayloadJson: {
            merchantTransactionId: payload.txnid,
          },
          responsePayloadJson: payload as any,
          status: attemptStatus,
        },
      });
    }


    if (payuStatus === "success") {
      await prisma.$transaction((tx) =>
        finalizeSuccessfulTopUp(tx, {
          tenantId,
          paymentOrderId: paymentOrder.id,
          walletAccountId: paymentOrder.walletAccountId,
          amountMinor: paymentOrder.amountMinor,
          merchantTransactionId: payload.txnid as string,
          payuTransactionId: payload.mihpayid as string,
        })
      );

      logger.info("PayU webhook payment success processed", {
        tenantId,
        merchantTxnId,
        payuTxnId: payload.mihpayid,
        amountRupees: Number(paymentOrder.amountMinor) / 100,
        payuMode: PAYU_MODE,
      });
    } else {
      await prisma.$transaction((tx) =>
        markFailedTopUp(tx, {
          tenantId,
          paymentOrderId: paymentOrder.id,
          walletAccountId: paymentOrder.walletAccountId,
          merchantTransactionId: payload.txnid as string,
          payuTransactionId: payload.mihpayid as string,
        })
      );

      logger.warn("PayU webhook payment failed", {
        tenantId,
        merchantTxnId,
        payuStatus,
        payuMode: PAYU_MODE,
      });
    }

    // Mark webhook as processed
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        processingStatus: "processed",
      },
    });

    return {
      success: true,
      message: `Payment ${payuStatus}`,
      tenantId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        processingStatus: "failed",
        processingError: errorMsg,
      },
    });

    throw err;
  }
}

// ─── RECONCILIATION ─────────────────────────────────────────────────────

export async function reconcilePaymentOrder(
  tenantId: string,
  paymentOrderId: string
): Promise<{ status: string; matched: boolean; details: string }> {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  const paymentOrder = await prisma.paymentOrder.findUnique({
    where: { id: paymentOrderId },
  });

  if (!paymentOrder || paymentOrder.tenantId !== tenantId) {
    throw new Error("Payment order not found or access denied");
  }

  if (!paymentOrder.payuTxnId) {
    return {
      status: "unresolved",
      matched: false,
      details: "No PayU transaction ID available",
    };
  }

  // Check for webhook event
  const webhookEvent = await prisma.paymentWebhookEvent.findFirst({
    where: {
      providerTxnId: paymentOrder.payuTxnId,
      provider: "payu",
    },
  });

  if (!webhookEvent) {
    return {
      status: "webhook_missing",
      matched: false,
      details: "Webhook not received",
    };
  }

  if (webhookEvent.processingStatus !== "processed") {
    return {
      status: "webhook_pending",
      matched: false,
      details: "Webhook not processed",
    };
  }

  // Check if webhook status matches payment order status
  const webhookPayload = webhookEvent.normalizedBodyJson as PayUWebhookPayload;
  const expectedStatus =
    webhookPayload.status === "success" ? "success" : "failed";
  const matched = paymentOrder.status === expectedStatus;

  if (matched) {
    return {
      status: "matched",
      matched: true,
      details: `Payment and webhook status match: ${expectedStatus}`,
    };
  } else {
    return {
      status: "mismatched",
      matched: false,
      details: `Payment order status: ${paymentOrder.status}, Webhook status: ${expectedStatus}`,
    };
  }
}

// ─── FETCH PAYMENT DETAILS ──────────────────────────────────────────────

export async function fetchPaymentOrderDetails(
  tenantId: string,
  paymentOrderId: string
) {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  const paymentOrder = await prisma.paymentOrder.findUnique({
    where: { id: paymentOrderId },
    include: {
      paymentAttempts: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!paymentOrder || paymentOrder.tenantId !== tenantId) {
    throw new Error("Payment order not found or access denied");
  }

  return {
    id: paymentOrder.id,
    tenantId: paymentOrder.tenantId,
    amount: Number(paymentOrder.amountMinor),
    currency: paymentOrder.currency,
    status: paymentOrder.status,
    provider: paymentOrder.provider,
    payuTxnId: paymentOrder.payuTxnId,
    merchantTxnId: paymentOrder.merchantTxnId,
    createdAt: paymentOrder.createdAt.toISOString(),
    updatedAt: paymentOrder.updatedAt.toISOString(),
    attempts: paymentOrder.paymentAttempts.map((att) => ({
      id: att.id,
      status: att.status,
      providerTxnId: att.providerTxnId,
      createdAt: att.createdAt.toISOString(),
    })),
  };
}

// ─── WEBHOOK DEBUG ENDPOINT ──────────────────────────────────────────────

export async function getRecentWebhookEvents(
  tenantId: string,
  limit: number = 20
) {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  const events = await prisma.paymentWebhookEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events.map((evt) => ({
    id: evt.id,
    eventType: evt.eventType,
    providerTxnId: evt.providerTxnId,
    processingStatus: evt.processingStatus,
    createdAt: evt.createdAt.toISOString(),
    error: evt.processingError,
  }));
}
