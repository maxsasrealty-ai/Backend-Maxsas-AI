// @ts-nocheck

import { Request, Response, Router } from "express";
import { normalizeTenantId } from "../lib/tenant-id";
import {
    formatPaise,
    getWalletBalance,
    listWalletTransactions,
} from "../repositories/walletLedgerRepository";
import { getCallBillingSummary, listCallBillingTransactions } from "../repositories/callBillingRepository";
import { authMiddleware } from "../middleware/auth";

const walletLedgerRouter = Router();

function resolveTenantId(req: Request): string | null {
  const contextTenantId = req.requestContext?.tenantId;
  if (contextTenantId) {
    return contextTenantId;
  }

  const tenantFromQuery = typeof req.query.tenantId === "string" ? req.query.tenantId : null;
  const tenantFromHeader = typeof req.headers["x-tenant-id"] === "string" ? req.headers["x-tenant-id"] : null;
  const rawTenantId = tenantFromHeader || tenantFromQuery;

  if (!rawTenantId) {
    return null;
  }

  return normalizeTenantId(rawTenantId);
}

function normalizeStatus(status?: string): "pending" | "success" | "failed" | "reversed" | undefined {
  if (!status) {
    return undefined;
  }

  const normalized = status.trim().toLowerCase();
  if (normalized === "completed") {
    return "success";
  }

  if (normalized === "pending" || normalized === "success" || normalized === "failed" || normalized === "reversed") {
    return normalized;
  }

  return undefined;
}

/**
 * Wallet Ledger Routes
 * 
 * Provides access to wallet transactions and balance for dashboard display.
 * All routes are tenant-scoped.
 */

// ─── GET /api/wallet/transactions ────────────────────────────────────────
// Fetch paginated wallet transactions for the tenant
walletLedgerRouter.get(
  "/transactions",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth?.id;
    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: {
          code: "TENANT_REQUIRED",
          message: "Tenant context is required. Provide x-tenant-id header or tenantId query.",
        },
      });
      return;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);
    const status = normalizeStatus(req.query.status as string | undefined);
    const entryType = req.query.entryType as string | undefined;

    try {
      const result = await listWalletTransactions({
        tenantId,
        userId,
        page,
        pageSize,
        status,
        entryType,
        sortOrder: "desc",
      });

      // Format response for dashboard
      const items = result.entries.map((entry) => ({
        id: entry.id,
        tenantId: entry.tenantId,
        type: entry.direction === "credit" ? "credit" : "debit",
        paymentStatus: entry.status,
        amountPaise: entry.amountMinor,
        signedAmountPaise: entry.direction === "credit" ? entry.amountMinor : -entry.amountMinor,
        amountFormatted: formatPaise(entry.amountMinor),
        currency: entry.currency,
        description: entry.description,
        status: entry.status,
        entryType: entry.entryType,
        transactionSource: entry.transactionSource || entry.referenceType || entry.entryType,
        provider: entry.referenceType || null,
        providerOrderId: entry.paymentOrderId || entry.referenceId || null,
        providerPaymentId: entry.externalTxnId || null,
        paymentGatewayReference: entry.externalTxnId || entry.referenceId || entry.paymentOrderId || null,
        externalTxnId: entry.externalTxnId,
        paymentOrderId: entry.paymentOrderId,
        referenceId: entry.referenceId,
        createdAt: entry.createdAt,
      }));

      res.status(200).json({
        success: true,
        data: {
          items,
          pagination: {
            page,
            pageSize,
            totalItems: result.total,
            totalPages: Math.ceil(result.total / pageSize),
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch transactions";
      res.status(400).json({
        success: false,
        error: {
          code: "TRANSACTIONS_FETCH_FAILED",
          message,
        },
      });
    }
  }
);

// ─── GET /api/wallet/summary ────────────────────────────────────────────
// Fetch wallet summary with balance and statistics
walletLedgerRouter.get(
  "/summary",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth?.id;
    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: {
          code: "TENANT_REQUIRED",
          message: "Tenant context is required. Provide x-tenant-id header or tenantId query.",
        },
      });
      return;
    }

    try {
      const summary = await getWalletBalance(tenantId, userId);
      const callBillingSummary = await getCallBillingSummary(tenantId);
      const recentCallBillingTransactions = await listCallBillingTransactions({
        tenantId,
        page: 1,
        pageSize: 10,
      });

      res.status(200).json({
        success: true,
        data: {
          tenantId: summary.tenantId,
          balancePaise: summary.balanceMinor,
          balanceFormatted: formatPaise(summary.balanceMinor),
          currency: summary.currency,
          totalCreditsPaise: summary.totalCreditsMinor,
          totalCreditsFormatted: formatPaise(summary.totalCreditsMinor),
          totalDebitsPaise: summary.totalDebitsMinor,
          totalDebitsFormatted: formatPaise(summary.totalDebitsMinor),
          pendingPaise: summary.pendingMinor,
          pendingFormatted: formatPaise(summary.pendingMinor),
          createdAt: summary.createdAt,
          callBillingSummary,
          recentCallBillingTransactions: recentCallBillingTransactions.items,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch summary";
      res.status(400).json({
        success: false,
        error: {
          code: "SUMMARY_FETCH_FAILED",
          message,
        },
      });
    }
  }
);

// Legacy alias for older clients still calling /api/wallet/balance
walletLedgerRouter.get(
  "/balance",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = resolveTenantId(req);
    const userId = req.auth?.id;
    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: {
          code: "TENANT_REQUIRED",
          message: "Tenant context is required. Provide x-tenant-id header or tenantId query.",
        },
      });
      return;
    }

    try {
      const summary = await getWalletBalance(tenantId, userId);
      const callBillingSummary = await getCallBillingSummary(tenantId);
      const recentCallBillingTransactions = await listCallBillingTransactions({
        tenantId,
        page: 1,
        pageSize: 10,
      });

      res.status(200).json({
        success: true,
        data: {
          tenantId: summary.tenantId,
          balancePaise: summary.balanceMinor,
          balanceFormatted: formatPaise(summary.balanceMinor),
          currency: summary.currency,
          totalCreditsPaise: summary.totalCreditsMinor,
          totalCreditsFormatted: formatPaise(summary.totalCreditsMinor),
          totalDebitsPaise: summary.totalDebitsMinor,
          totalDebitsFormatted: formatPaise(summary.totalDebitsMinor),
          pendingPaise: summary.pendingMinor,
          pendingFormatted: formatPaise(summary.pendingMinor),
          createdAt: summary.createdAt,
          callBillingSummary,
          recentCallBillingTransactions: recentCallBillingTransactions.items,
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

export default walletLedgerRouter;
