import express, { Request, Response, Router } from "express";
import type { RequestContext } from "../types/request";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { requireTenant } from "../middleware/requireTenant";
import { getOrCreateWalletAccount, getWalletBalance } from "../repositories/walletLedgerRepository";
import { getBackendControlState } from "../services/backendControlService";
import {
    fetchPaymentOrderDetails,
    getRecentWebhookEvents,
    initiatePaymentOrder,
    processPayUWebhook,
    reconcilePaymentOrder,
    verifyPaymentFromRedirect,
} from "../services/payuService";

const payuRouter = Router();

const DEFAULT_WEB_APP_URL =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.EXPO_PUBLIC_WEB_APP_URL ||
  process.env.PAYU_FRONTEND_WEB_APP_URL ||
  process.env.PAYU_REDIRECT_URL ||
  "http://localhost:8081";
const LOCAL_PAYU_RETURN_URL = process.env.PAYU_LOCAL_RETURN_URL || "";

type PayURequest = Request & { requestContext?: RequestContext };

const FALLBACK_WEB_APP_BASE = "http://localhost:8081";
const FALLBACK_SERVER_BASE = "http://localhost:4000";

function formatPaise(amountPaise: number): string {
  return `₹${(amountPaise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function readPayUReturnField(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function resolveAbsoluteHttpUrl(candidate: string | undefined, fallback: string): string {
  const value = candidate?.trim();
  if (!value) {
    return fallback;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }

    if (url.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) {
      url.protocol = "https:";
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function resolvePayUReturnBaseUrl(): string {
  const localFallback = LOCAL_PAYU_RETURN_URL.trim();
  if (localFallback) {
    return resolveAbsoluteHttpUrl(localFallback, FALLBACK_WEB_APP_BASE);
  }

  return resolveAbsoluteHttpUrl(DEFAULT_WEB_APP_URL, FALLBACK_WEB_APP_BASE);
}

function normalizePublicBaseUrl(value: string): string {
  return resolveAbsoluteHttpUrl(value, FALLBACK_WEB_APP_BASE);
}

function normalizePayUCallbackUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.pathname === "/lexus/wallet") {
      url.pathname = "/payment/payu";
    }

    return url.toString();
  } catch {
    return value.replace("/lexus/wallet", "/payment/payu");
  }
}

function resolvePayUServerReturnBaseUrl(): string {
  // Prefer explicit server return base if configured, else derive from PAYU_WEBHOOK_URL origin,
  // then fallback to frontend '/api' (typically HTTPS), and finally localhost backend.
  const explicit = (process.env.PAYU_SERVER_RETURN_BASE || "").trim();
  if (explicit) {
    return resolveAbsoluteHttpUrl(explicit, FALLBACK_SERVER_BASE);
  }

  const webhook = (process.env.PAYU_WEBHOOK_URL || "").trim();
  try {
    if (webhook) {
      const u = new URL(webhook);
      return resolveAbsoluteHttpUrl(`${u.protocol}//${u.host}`, FALLBACK_SERVER_BASE);
    }
  } catch (_) {
    // ignore
  }

  const frontendBase = resolveFrontendBaseUrl();
  if (frontendBase) {
    return resolveAbsoluteHttpUrl(`${frontendBase}/api`, FALLBACK_SERVER_BASE);
  }

  return FALLBACK_SERVER_BASE;
}

function buildPayUServerCallbackUrl(
  paymentStatus: "success" | "failure",
  payload: Record<string, unknown> = {},
  paymentOrderId?: string,
  merchantTransactionId?: string,
): string {
  try {
    const base = resolvePayUServerReturnBaseUrl();
    const path = `/api/payments/payu/return/${paymentStatus}`;
    const url = new URL(path, base);
    url.searchParams.set("_ts", String(Date.now()));

    const txnid = readPayUReturnField(payload.txnid);
    const mihpayid = readPayUReturnField(payload.mihpayid);

    if (txnid) url.searchParams.set("txnid", txnid);
    if (mihpayid) url.searchParams.set("mihpayid", mihpayid);
    if (paymentOrderId) url.searchParams.set("payment_order_id", paymentOrderId);
    if (merchantTransactionId) url.searchParams.set("merchant_txn_id", merchantTransactionId);

    return url.toString();
  } catch {
    return `${resolvePayUServerReturnBaseUrl()}/payments/payu/return/${paymentStatus}`;
  }
}

function buildPayUFrontendCallbackUrl(
  paymentStatus: "success" | "failure",
  payload: Record<string, unknown> = {},
  paymentOrderId?: string,
  merchantTransactionId?: string,
): string {
  try {
    const url = new URL("/payment/payu", resolvePayUReturnBaseUrl());
    url.searchParams.set("payment", paymentStatus);

    const txnid = readPayUReturnField(payload.txnid);
    const mihpayid = readPayUReturnField(payload.mihpayid);
    const amount = readPayUReturnField(payload.amount);
    const error = readPayUReturnField(payload.error);
    const reason = readPayUReturnField(payload.reason);
    const errorMessage = readPayUReturnField(payload.error_Message);

    if (txnid) {
      url.searchParams.set("txnid", txnid);
    }

    if (mihpayid) {
      url.searchParams.set("mihpayid", mihpayid);
    }

    if (paymentOrderId) {
      url.searchParams.set("payment_order_id", paymentOrderId);
    }

    if (merchantTransactionId) {
      url.searchParams.set("merchant_txn_id", merchantTransactionId);
    }

    if (amount) {
      url.searchParams.set("amount", amount);
    }

    if (error) {
      url.searchParams.set("error", error);
    }

    if (reason) {
      url.searchParams.set("reason", reason);
    }

    if (errorMessage) {
      url.searchParams.set("error_Message", errorMessage);
    }

    return url.toString();
  } catch {
    const fallbackUrl = new URL("/payment/payu", "http://localhost:8081");
    fallbackUrl.searchParams.set("payment", paymentStatus === "success" ? "success" : "failure");
    if (paymentOrderId) fallbackUrl.searchParams.set("payment_order_id", paymentOrderId);
    if (merchantTransactionId) fallbackUrl.searchParams.set("merchant_txn_id", merchantTransactionId);
    const amount = readPayUReturnField(payload.amount);
    const error = readPayUReturnField(payload.error);
    const reason = readPayUReturnField(payload.reason);
    const errorMessage = readPayUReturnField(payload.error_Message);
    if (amount) fallbackUrl.searchParams.set("amount", amount);
    if (error) fallbackUrl.searchParams.set("error", error);
    if (reason) fallbackUrl.searchParams.set("reason", reason);
    if (errorMessage) fallbackUrl.searchParams.set("error_Message", errorMessage);
    return fallbackUrl.toString();
  }
}

function appendPayUCallbackContext(
  callbackUrl: string,
  paymentOrderId?: string,
  merchantTransactionId?: string,
): string {
  try {
    const url = new URL(callbackUrl, resolvePayUReturnBaseUrl());

    if (paymentOrderId) {
      url.searchParams.set("payment_order_id", paymentOrderId);
    }

    if (merchantTransactionId) {
      url.searchParams.set("merchant_txn_id", merchantTransactionId);
    }

    return url.toString();
  } catch {
    return callbackUrl;
  }
}

function isLegacyBackendReturnUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }

  return /\/api\/payments\/payu\/return\/(success|failure)(?:[/?#]|$)/i.test(url);
}

function resolveFrontendBaseUrl(): string {
  return normalizePublicBaseUrl(DEFAULT_WEB_APP_URL);
}

/**
 * PayU Payment Integration Routes
 * 
 * All routes are tenant-aware and require authentication.
 */

// ─── POST /api/payments/payu/initiate ────────────────────────────────────
// Initiate a new payment order
payuRouter.post(
  "/payu/initiate",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;

    try {
      const {
        amount,
        description,
        email,
        phoneNumber,
        userId,
        successUrl,
        failureUrl,
      } = req.body;

      if (!amount || !email || !phoneNumber || !userId) {
        res.status(400).json({
          success: false,
          error: {
            code: "MISSING_FIELDS",
            message: "amount, email, phoneNumber, userId are required",
          },
        });
        return;
      }

      const amountPaise = Number(amount);
      if (!Number.isFinite(amountPaise) || !Number.isInteger(amountPaise) || amountPaise < 1000) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_AMOUNT",
            message: "amount must be at least 1000 paise (₹10)",
          },
        });
        return;
      }
      if (amountPaise > 10000000) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_AMOUNT",
            message: "amount cannot exceed 10000000 paise (₹1,00,000)",
          },
        });
        return;
      }

      // Read runtime backend control settings so admin toggles take immediate effect
      const backendControl = await getBackendControlState();
      const frontendTarget = backendControl.integrations?.payuFrontendTarget || undefined;
      const frontendBaseOverride = frontendTarget === "local" ? "http://localhost:8081" : undefined;
      const computedFrontendBase = frontendBaseOverride || DEFAULT_WEB_APP_URL;

      const serverReturnOverride = typeof backendControl.integrations?.payuServerReturnBase === "string" && backendControl.integrations.payuServerReturnBase.trim().length > 0
        ? normalizePublicBaseUrl(backendControl.integrations.payuServerReturnBase.trim())
        : undefined;

      const serverReturnBase = serverReturnOverride || resolvePayUServerReturnBaseUrl();

      const requestedSuccessUrl = typeof successUrl === "string" && successUrl.trim().length > 0
        ? normalizePayUCallbackUrl(successUrl.trim())
        : `${normalizePublicBaseUrl(computedFrontendBase)}/payment/payu?payment=success`;
      const requestedFailureUrl = typeof failureUrl === "string" && failureUrl.trim().length > 0
        ? normalizePayUCallbackUrl(failureUrl.trim())
        : `${normalizePublicBaseUrl(computedFrontendBase)}/payment/payu?payment=failure`;

      const backendSuccessUrl = new URL(`/api/payments/payu/return/success`, serverReturnBase).toString();
      const backendFailureUrl = new URL(`/api/payments/payu/return/failure`, serverReturnBase).toString();

      const result = await initiatePaymentOrder({
        tenantId,
        userId,
        amount: amountPaise,
        description: description || "Wallet top-up",
        email: String(email).trim().toLowerCase(),
        phoneNumber: String(phoneNumber),
        successUrl: backendSuccessUrl,
        failureUrl: backendFailureUrl,
        metadata: {},
      });

      const resolvedSuccessUrl = new URL(`/api/payments/payu/return/success`, serverReturnBase);
      resolvedSuccessUrl.searchParams.set("payment_order_id", result.paymentOrderId);
      resolvedSuccessUrl.searchParams.set("merchant_txn_id", result.merchantTransactionId);
      resolvedSuccessUrl.searchParams.set("_ts", String(Date.now()));

      const resolvedFailureUrl = new URL(`/api/payments/payu/return/failure`, serverReturnBase);
      resolvedFailureUrl.searchParams.set("payment_order_id", result.paymentOrderId);
      resolvedFailureUrl.searchParams.set("merchant_txn_id", result.merchantTransactionId);
      resolvedFailureUrl.searchParams.set("_ts", String(Date.now()));

      const frontendSuccessUrl = new URL(requestedSuccessUrl, normalizePublicBaseUrl(computedFrontendBase));
      frontendSuccessUrl.searchParams.set("payment_order_id", result.paymentOrderId);
      frontendSuccessUrl.searchParams.set("merchant_txn_id", result.merchantTransactionId);

      const frontendFailureUrl = new URL(requestedFailureUrl, normalizePublicBaseUrl(computedFrontendBase));
      frontendFailureUrl.searchParams.set("payment_order_id", result.paymentOrderId);
      frontendFailureUrl.searchParams.set("merchant_txn_id", result.merchantTransactionId);

      logger.info("PayU redirect URLs resolved", {
        tenantId,
        paymentOrderId: result.paymentOrderId,
        merchantTransactionId: result.merchantTransactionId,
        serverReturnBase,
        computedFrontendBase,
        requestedSuccessUrl,
        requestedFailureUrl,
        backendSuccessUrl: backendSuccessUrl.toString(),
        backendFailureUrl: backendFailureUrl.toString(),
        frontendSuccessUrl: frontendSuccessUrl.toString(),
        frontendFailureUrl: frontendFailureUrl.toString(),
      });

      await prisma.paymentOrder.update({
        where: { id: result.paymentOrderId },
        data: {
          successUrl: frontendSuccessUrl.toString(),
          failureUrl: frontendFailureUrl.toString(),
        },
      });

      if (successUrl || failureUrl) {
        logger.info("PayU client callback URLs resolved for frontend redirect", {
          tenantId,
          requestedSuccessUrl: successUrl,
          requestedFailureUrl: failureUrl,
          resolvedSuccessUrl: resolvedSuccessUrl.toString(),
          resolvedFailureUrl: resolvedFailureUrl.toString(),
          frontendSuccessUrl: frontendSuccessUrl.toString(),
          frontendFailureUrl: frontendFailureUrl.toString(),
          frontendBaseUrl: resolveFrontendBaseUrl(),
        });
      }

      logger.info("PayU initiate response returned to frontend", {
        tenantId,
        paymentOrderId: result.paymentOrderId,
        merchantTransactionId: result.merchantTransactionId,
        payuMode: result.payuMode,
        payuUrl: result.payuUrl,
        payuUrlHasTrailingSlash: /\/$/.test(result.payuUrl),
        amountPaise: result.amount,
        amountRupees: result.amount / 100,
        successUrl: result.successUrl,
        failureUrl: result.failureUrl,
        responsePayload: result,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment initiation failed";
      res.status(400).json({
        success: false,
        error: {
          code: "PAYMENT_INIT_FAILED",
          message,
        },
      });
    }
  }
);

// ─── POST/GET /api/payments/payu/return/{success|failure} ───────────────
// PayU redirects can hit callback URLs with POST form data. Bridge them to
// frontend GET routes to avoid HTTP 405 on client routes.
payuRouter.post(
  "/payu/return/success",
  express.urlencoded({ extended: false }),
  async (req: Request, res: Response): Promise<void> => {
    const txnid = readPayUReturnField(req.body?.txnid);
    const mihpayid = readPayUReturnField(req.body?.mihpayid);
    const status = readPayUReturnField(req.body?.status);
    
    logger.info("PayU return success callback received", {
      txnid,
      mihpayid,
      status,
      payload: req.body,
    });

    try {
      const payload = req.body as Record<string, unknown>;
      const payloadHash = readPayUReturnField(payload.hash) || "";
      const result = await processPayUWebhook(JSON.stringify(payload), payloadHash);
      logger.info("PayU return success processed via webhook service", {
        txnid,
        mihpayid,
        processingSuccess: result.success,
        processingMessage: result.message,
        tenantId: result.tenantId,
      });
    } catch (error) {
      logger.warn("PayU return success processing failed", {
        txnid,
        mihpayid,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    
    const redirectTo = buildPayUFrontendCallbackUrl("success", req.body as Record<string, unknown>);
    res.redirect(302, redirectTo);
  }
);

payuRouter.get(
  "/payu/return/success",
  async (req: Request, res: Response): Promise<void> => {
    logger.info("PayU return success (GET)", {
      query: req.query,
    });
    const redirectTo = buildPayUFrontendCallbackUrl("success", req.query as Record<string, unknown>);
    res.redirect(302, redirectTo);
  }
);

payuRouter.post(
  "/payu/return/failure",
  express.urlencoded({ extended: false }),
  async (req: Request, res: Response): Promise<void> => {
    const txnid = readPayUReturnField(req.body?.txnid);
    const mihpayid = readPayUReturnField(req.body?.mihpayid);
    const status = readPayUReturnField(req.body?.status);
    
    logger.warn("PayU return failure callback received", {
      txnid,
      mihpayid,
      status,
      error: readPayUReturnField(req.body?.error),
      error_Message: readPayUReturnField(req.body?.error_Message),
      payload: req.body,
    });

    try {
      const payload = req.body as Record<string, unknown>;
      const payloadHash = readPayUReturnField(payload.hash) || "";
      const result = await processPayUWebhook(JSON.stringify(payload), payloadHash);
      logger.info("PayU return failure processed via webhook service", {
        txnid,
        mihpayid,
        processingSuccess: result.success,
        processingMessage: result.message,
        tenantId: result.tenantId,
      });
    } catch (error) {
      logger.warn("PayU return failure processing failed", {
        txnid,
        mihpayid,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    
    const redirectTo = buildPayUFrontendCallbackUrl("failure", req.body as Record<string, unknown>);
    res.redirect(302, redirectTo);
  }
);

async function handleVerifyRedirect(req: PayURequest, res: Response): Promise<void> {
  const tenantId = req.requestContext?.tenantId as string;
  const paymentOrderId = Array.isArray(req.params.paymentOrderId)
    ? req.params.paymentOrderId[0]
    : req.params.paymentOrderId || (typeof req.body?.paymentOrderId === "string" ? req.body.paymentOrderId : undefined);
  const merchantTransactionId = Array.isArray(req.body?.merchantTransactionId)
    ? req.body.merchantTransactionId[0]
    : req.body?.merchantTransactionId;
  const payuTransactionId = Array.isArray(req.body?.payuTransactionId)
    ? req.body.payuTransactionId[0]
    : req.body?.payuTransactionId;
  const status = Array.isArray(req.body?.status)
    ? req.body.status[0]
    : req.body?.status;

  try {
    if (!paymentOrderId || !merchantTransactionId || !payuTransactionId || !status) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "paymentOrderId, merchantTransactionId, payuTransactionId, status are required",
        },
      });
      return;
    }

    const result = await verifyPaymentFromRedirect({
      tenantId,
      paymentOrderId,
      merchantTransactionId,
      payuTransactionId,
      status,
    });

    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json({
      success: result.success,
      message: result.message,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    res.status(400).json({
      success: false,
      error: {
        code: "VERIFY_FAILED",
        message,
      },
    });
  }
}

payuRouter.get(
  "/payu/return/failure",
  async (req: Request, res: Response): Promise<void> => {
    logger.warn("PayU return failure (GET)", {
      query: req.query,
    });
    const redirectTo = buildPayUFrontendCallbackUrl("failure", req.query as Record<string, unknown>);
    res.redirect(302, redirectTo);
  }
);

// ─── POST /api/payments/payu/mock-success ───────────────────────────────
// Dev-only helper to simulate successful wallet credit without opening PayU.
payuRouter.post(
  "/payu/mock-success",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    if (process.env.APP_ENV === "production") {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Mock top-up is not available in production",
        },
      });
      return;
    }

    const tenantId = req.requestContext?.tenantId as string;
    const amountPaise = Number(req.body?.amount);
    const userId = typeof req.body?.userId === "string" ? req.body.userId : null;

    if (!Number.isFinite(amountPaise) || !Number.isInteger(amountPaise) || amountPaise < 1000) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_AMOUNT",
          message: "amount must be at least 1000 paise (₹10)",
        },
      });
      return;
    }
    if (amountPaise > 10000000) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_AMOUNT",
          message: "amount cannot exceed 10000000 paise (₹1,00,000)",
        },
      });
      return;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const walletAccount = await getOrCreateWalletAccount(tenantId, userId ?? undefined, tx);

        const ledgerEntry = await tx.walletLedger.create({
          data: {
            tenantId,
            walletAccountId: walletAccount.id,
            direction: "credit",
            amountMinor: BigInt(amountPaise),
            currency: "INR",
            status: "success",
            entryType: "wallet_topup",
            description: `Mock top-up credit (${formatPaise(amountPaise)})`,
            idempotencyKey: `mock_topup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            metaJson: {
              source: "dev_mock_success",
            },
          },
        });

        const updatedWallet = await tx.walletAccount.update({
          where: { id: walletAccount.id },
          data: {
            currentBalanceMinor: {
              increment: BigInt(amountPaise),
            },
          },
        });

        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            walletBalancePaise: {
              increment: amountPaise,
            },
          },
        });

        return {
          tenantId,
          walletAccountId: walletAccount.id,
          amountPaise,
          amountFormatted: formatPaise(amountPaise),
          newBalancePaise: Number(updatedWallet.currentBalanceMinor),
          newBalanceFormatted: formatPaise(Number(updatedWallet.currentBalanceMinor)),
          ledgerEntryId: ledgerEntry.id,
        };
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mock top-up failed";
      res.status(400).json({
        success: false,
        error: {
          code: "MOCK_TOPUP_FAILED",
          message,
        },
      });
    }
  }
);

// ─── GET /api/payments ───────────────────────────────────────────────────
// List payment orders for the tenant with pagination. Returns summary items
// including provider identifiers so the frontend can match transactions.
payuRouter.get(
  "/",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;
    try {
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 20);
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;

      const where: any = { tenantId };
      if (userId) where.userId = userId;

      const total = await prisma.paymentOrder.count({ where });

      const orders = await prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Math.max(1, page) - 1) * pageSize,
        take: pageSize,
        include: {
          paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      const items = orders.map((o) => ({
        id: o.id,
        amount: Number(o.amountMinor),
        currency: o.currency,
        status: o.status,
        provider: o.provider,
        providerMode: o.providerMode,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        merchantTxnId: o.merchantTxnId,
        payuTxnId: o.payuTxnId,
        attempts: o.paymentAttempts.map((a) => ({ id: a.id, status: a.status, providerTxnId: a.providerTxnId, createdAt: a.createdAt.toISOString() })),
      }));

      res.status(200).json({
        success: true,
        data: {
          items,
          pagination: {
            page: Math.max(1, page),
            pageSize,
            total,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list payments";
      res.status(400).json({ success: false, error: { code: "LIST_FAILED", message } });
    }
  }
);

// ─── GET /api/payments/:paymentOrderId ───────────────────────────────────
// Fetch payment order details
payuRouter.get(
  "/:paymentOrderId",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;
    const paymentOrderId = Array.isArray(req.params.paymentOrderId)
      ? req.params.paymentOrderId[0]
      : req.params.paymentOrderId;

    try {
      const result = await fetchPaymentOrderDetails(tenantId, paymentOrderId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch payment";
      const statusCode = message.includes("not found") ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: {
          code: "FETCH_FAILED",
          message,
        },
      });
    }
  }
);

// ─── POST /api/payments/:paymentOrderId/verify-redirect ──────────────────
// Verify payment after redirect from PayU
payuRouter.post(
  "/:paymentOrderId/verify-redirect",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    await handleVerifyRedirect(req, res);
  }
);

payuRouter.post(
  "/verify-redirect",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    await handleVerifyRedirect(req, res);
  }
);

// ─── POST /api/payments/payu/webhook ──────────────────────────────────────
// Receive PayU webhook notification
// Note: This route expects raw body content type and signature verification
payuRouter.post(
  "/payu/webhook",
  async (req: PayURequest, res: Response): Promise<void> => {
    try {
      // Get raw body
      const rawBody =
        req.body instanceof Buffer
          ? req.body.toString("utf-8")
          : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);

      // Get signature from headers
      const headerHash = (req.headers["x-payu-signature"] ||
        req.headers["x-signature"]) as string;

      const result = await processPayUWebhook(rawBody, headerHash || "");

      res.status(200).json({
        success: result.success,
        message: result.message,
      });
    } catch (err) {
      console.error("[PayU Webhook Error]", err);
      res.status(400).json({
        success: false,
        error: {
          code: "WEBHOOK_FAILED",
          message: err instanceof Error ? err.message : "Webhook processing failed",
        },
      });
    }
  }
);

// ─── POST /api/payments/:paymentOrderId/reconcile ────────────────────────
// Manual reconciliation/verification of a payment
payuRouter.post(
  "/:paymentOrderId/reconcile",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;
    const paymentOrderId = Array.isArray(req.params.paymentOrderId)
      ? req.params.paymentOrderId[0]
      : req.params.paymentOrderId;

    try {
      const result = await reconcilePaymentOrder(tenantId, paymentOrderId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reconciliation failed";
      res.status(400).json({
        success: false,
        error: {
          code: "RECONCILE_FAILED",
          message,
        },
      });
    }
  }
);

// ─── GET /api/wallet/balance ─────────────────────────────────────────────
// Fetch wallet balance (tenant-scoped)
payuRouter.get(
  "/balance",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    const tenantId = req.requestContext?.tenantId as string;

    try {
      const result = await getWalletBalance(tenantId);
      res.status(200).json({
        success: true,
        data: {
          tenantId: result.tenantId,
          balanceMinor: result.balanceMinor,
          balanceFormatted: `₹${(result.balanceMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          currency: result.currency,
          totalCreditsMinor: result.totalCreditsMinor,
          totalDebitsMinor: result.totalDebitsMinor,
          createdAt: result.createdAt,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch balance";
      res.status(400).json({
        success: false,
        error: {
          code: "BALANCE_FETCH_FAILED",
          message,
        },
      });
    }
  }
);

// ─── GET /api/payments/status ────────────────────────────────────────────
// Query payment order status by merchant transaction id or payment order id
payuRouter.get(
  "/status",
  requireTenant,
  async (req: PayURequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.requestContext?.tenantId as string;
      const merchantTxnId = typeof req.query.merchant_txn_id === "string" ? req.query.merchant_txn_id.trim() : "";
      const paymentOrderId = typeof req.query.payment_order_id === "string" ? req.query.payment_order_id.trim() : "";

      if (!merchantTxnId && !paymentOrderId) {
        res.status(400).json({ success: false, error: { code: "MISSING_PARAMS", message: "merchant_txn_id or payment_order_id is required" } });
        return;
      }

      const where: any = { tenantId };
      if (merchantTxnId) where.merchantTxnId = merchantTxnId;
      if (paymentOrderId) where.id = paymentOrderId;

      const order = await prisma.paymentOrder.findFirst({
        where,
        include: {
          paymentAttempts: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });

      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment order not found" } });
        return;
      }

      // Check related wallet ledger entries
      const ledgers = await prisma.walletLedger.findMany({ where: { paymentOrderId: order.id }, orderBy: { createdAt: "asc" } });

      const walletCredited = ledgers.some((l) => String(l.status || "").toLowerCase() === "completed" || String(l.status || "").toLowerCase() === "applied" || String(l.status || "").toLowerCase() === "confirmed");

      res.status(200).json({
        success: true,
        data: {
          paymentOrderId: order.id,
          merchantTxnId: order.merchantTxnId,
          provider: order.provider,
          providerMode: order.providerMode,
          status: order.status,
          amountMinor: Number(order.amountMinor || 0),
          currency: order.currency,
          payuTxnId: order.payuTxnId || null,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          walletCredited,
          ledgerEntries: ledgers.map((l) => ({ id: l.id, status: l.status, amountMinor: Number(l.amountMinor || 0), entryType: l.entryType, createdAt: l.createdAt })),
          attempts: order.paymentAttempts.map((a) => ({ id: a.id, status: a.status, providerTxnId: a.providerTxnId, createdAt: a.createdAt })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch payment status";
      res.status(400).json({ success: false, error: { code: "FETCH_FAILED", message } });
    }
  }
);

// ─── PUBLIC PAYMENT STATUS ENDPOINT (no auth) ───────────────────────────
// Query limited payment order status by merchant transaction id or payment order id without requiring auth.
payuRouter.get(
  "/public/status",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const merchantTxnId = typeof req.query.merchant_txn_id === "string" ? req.query.merchant_txn_id.trim() : "";
      const paymentOrderId = typeof req.query.payment_order_id === "string" ? req.query.payment_order_id.trim() : "";

      if (!merchantTxnId && !paymentOrderId) {
        res.status(400).json({ success: false, error: { code: "MISSING_PARAMS", message: "merchant_txn_id or payment_order_id is required" } });
        return;
      }

      const where: any = {};
      if (merchantTxnId) where.merchantTxnId = merchantTxnId;
      if (paymentOrderId) where.id = paymentOrderId;

      const order = await prisma.paymentOrder.findFirst({ where, include: { paymentAttempts: { orderBy: { createdAt: "desc" }, take: 5 } } });
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment order not found" } });
        return;
      }

      const ledgers = await prisma.walletLedger.findMany({ where: { paymentOrderId: order.id }, orderBy: { createdAt: "asc" } });
      const walletCredited = ledgers.some((l) => String(l.status || "").toLowerCase() === "completed" || String(l.status || "").toLowerCase() === "applied" || String(l.status || "").toLowerCase() === "confirmed");

      res.status(200).json({
        success: true,
        data: {
          paymentOrderId: order.id,
          merchantTxnId: order.merchantTxnId,
          status: order.status,
          amountMinor: Number(order.amountMinor || 0),
          currency: order.currency,
          walletCredited,
          attempts: order.paymentAttempts.map((a) => ({ id: a.id, status: a.status, providerTxnId: a.providerTxnId, createdAt: a.createdAt })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch public payment status";
      res.status(400).json({ success: false, error: { code: "FETCH_FAILED", message } });
    }
  }
);


// ─── ADMIN DEBUG ENDPOINTS (Internal use only) ────────────────────────────

// GET /api/admin/webhooks/recent/:tenantId
// Debug endpoint to view recent webhook events
payuRouter.get(
  "/admin/webhooks/recent/:tenantId",
  async (req: PayURequest, res: Response): Promise<void> => {
    const tenantId = Array.isArray(req.params.tenantId)
      ? req.params.tenantId[0]
      : req.params.tenantId;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    try {
      const events = await getRecentWebhookEvents(tenantId, limit);
      res.status(200).json({
        success: true,
        data: {
          tenantId,
          count: events.length,
          events,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch webhooks";
      res.status(400).json({
        success: false,
        error: {
          code: "WEBHOOK_FETCH_FAILED",
          message,
        },
      });
    }
  }
);

export default payuRouter;
