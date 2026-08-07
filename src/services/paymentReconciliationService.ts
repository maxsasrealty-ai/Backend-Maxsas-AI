import { prisma } from "../lib/prisma";
import { normalizeTenantId } from "../lib/tenant-id";
import { assertUuid } from "../lib/uuid";
import { buildWalletTopUpDescription } from "./payuService";

/**
 * Payment Reconciliation Service
 * 
 * Reconciles payment states across different checkpoints:
 * 1. Redirect verification vs webhook
 * 2. Webhook vs PayU verification API
 * 3. Manual checks and resolution
 */

export interface ReconciliationResult {
  paymentOrderId: string;
  tenantId: string;
  status: "matched" | "mismatched" | "resolved";
  details: {
    paymentStatus: string;
    webhookStatus?: string;
    webhookReceived: boolean;
    webhookProcessed: boolean;
    source: string;
    action: string;
  };
}

// ─── RECONCILE UNRESOLVED PAYMENTS ──────────────────────────────────────

export async function reconcileUnresolvedPayments(
  tenantId: string | null = null
): Promise<ReconciliationResult[]> {
  const whereClause: any = {
    status: {
      in: ["created", "pending", "initiated"],
    },
  };

  if (tenantId) {
    whereClause.tenantId = normalizeTenantId(tenantId);
  }

  // Find unresolved payment orders (created > 30 mins ago)
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  whereClause.createdAt = {
    lt: thirtyMinsAgo,
  };

  const unresolvedPayments = await prisma.paymentOrder.findMany({
    where: whereClause,
    take: 100, // Limit to prevent excessive queries
  });

  const results: ReconciliationResult[] = [];

  for (const payment of unresolvedPayments) {
    // Check for webhook event
    if (!payment.payuTxnId) {
      results.push({
        paymentOrderId: payment.id,
        tenantId: payment.tenantId,
        status: "mismatched",
        details: {
          paymentStatus: payment.status,
          webhookReceived: false,
          webhookProcessed: false,
          source: "payment_order_missing_txn",
          action: "awaiting_webhook",
        },
      });
      continue;
    }

    // Find matching webhook event
    const webhookEvent = await prisma.paymentWebhookEvent.findFirst({
      where: {
        providerTxnId: payment.payuTxnId,
        provider: "payu",
      },
    });

    if (!webhookEvent) {
      results.push({
        paymentOrderId: payment.id,
        tenantId: payment.tenantId,
        status: "mismatched",
        details: {
          paymentStatus: payment.status,
          webhookReceived: false,
          webhookProcessed: false,
          source: "webhook_not_found",
          action: "investigate_payu",
        },
      });
      continue;
    }

    // Check webhook processing status
    if (webhookEvent.processingStatus === "failed") {
      results.push({
        paymentOrderId: payment.id,
        tenantId: payment.tenantId,
        status: "mismatched",
        details: {
          paymentStatus: payment.status,
          webhookStatus: "failed",
          webhookReceived: true,
          webhookProcessed: false,
          source: "webhook_processing_failed",
          action: "retry_webhook_processing",
        },
      });

      // Attempt to reprocess the webhook
      try {
        const normalizedBody = webhookEvent.normalizedBodyJson as any;
        if (normalizedBody && normalizedBody.status === "success") {
          // Mark payment as successful
          await prisma.paymentOrder.update({
            where: { id: payment.id },
            data: { status: "success" },
          });

          results[results.length - 1].status = "resolved";
          results[results.length - 1].details.action = "manually_resolved_success";
        }
      } catch (err) {
        console.error(`[Reconciliation] Failed to reprocess webhook for ${payment.id}:`, err);
      }
      continue;
    }

    if (webhookEvent.processingStatus === "processed") {
      // Webhook was processed, verify payment order status matches
      const webhookPayload = webhookEvent.normalizedBodyJson as any;
      const expectedStatus =
        webhookPayload?.status === "success" ? "success" : "failed";

      if (payment.status === expectedStatus) {
        results.push({
          paymentOrderId: payment.id,
          tenantId: payment.tenantId,
          status: "matched",
          details: {
            paymentStatus: payment.status,
            webhookStatus: webhookPayload?.status,
            webhookReceived: true,
            webhookProcessed: true,
            source: "webhook_processed",
            action: "none",
          },
        });
      } else {
        // Status mismatch - webhook says success but payment order says pending
        results.push({
          paymentOrderId: payment.id,
          tenantId: payment.tenantId,
          status: "mismatched",
          details: {
            paymentStatus: payment.status,
            webhookStatus: webhookPayload?.status,
            webhookReceived: true,
            webhookProcessed: true,
            source: "status_mismatch",
            action: "manual_review_required",
          },
        });

        // If webhook says success, try to resolve
        if (expectedStatus === "success") {
          try {
            await prisma.$transaction(async (tx) => {
              // Reconciliation uses the same ledger idempotency key as the webhook path so both
              // code paths converge on one credit entry instead of creating parallel balances.
              const transition = await tx.paymentOrder.updateMany({
                where: {
                  id: payment.id,
                  tenantId: payment.tenantId,
                  status: {
                    notIn: ["success", "failed"],
                  },
                },
                data: {
                  status: "success",
                },
              });

              if (transition.count === 0 || !payment.walletAccountId) {
                return;
              }

              const idempotencyKey = `ledger_${payment.id}`;
              const existingLedger = await tx.walletLedger.findUnique({
                where: {
                  walletAccountId_idempotencyKey: {
                    walletAccountId: payment.walletAccountId,
                    idempotencyKey,
                  },
                },
              });

              if (existingLedger?.status === "success") {
                return;
              }

              if (existingLedger) {
                await tx.walletLedger.update({
                  where: { id: existingLedger.id },
                  data: {
                    status: "success",
                    externalTxnId: webhookPayload?.mihpayid as string,
                    referenceType: "payu",
                    referenceId: payment.id,
                  },
                });
              } else {
                await tx.walletLedger.create({
                  data: {
                    tenantId: payment.tenantId,
                    walletAccountId: payment.walletAccountId,
                    direction: "credit",
                    amountMinor: payment.amountMinor,
                    currency: "INR",
                    status: "success",
                    entryType: "wallet_topup",
                    paymentOrderId: payment.id,
                    externalTxnId: webhookPayload?.mihpayid as string,
                    referenceType: "payu",
                    referenceId: payment.id,
                    description: `${buildWalletTopUpDescription(Number(payment.amountMinor))} - Reconciliation`,
                    idempotencyKey,
                  },
                });
              }

              await tx.walletAccount.update({
                where: { id: payment.walletAccountId },
                data: {
                  currentBalanceMinor: {
                    increment: payment.amountMinor,
                  },
                },
              });

              await tx.tenant.update({
                where: { id: payment.tenantId },
                data: {
                  walletBalancePaise: {
                    increment: Number(payment.amountMinor),
                  },
                },
              });
            });

            results[results.length - 1].status = "resolved";
            results[results.length - 1].details.action = "reconciliation_resolved";
          } catch (err) {
            console.error(`[Reconciliation] Failed to resolve ${payment.id}:`, err);
          }
        }
      }
    } else {
      // Webhook received but not processed yet
      results.push({
        paymentOrderId: payment.id,
        tenantId: payment.tenantId,
        status: "mismatched",
        details: {
          paymentStatus: payment.status,
          webhookReceived: true,
          webhookProcessed: false,
          source: "webhook_pending_processing",
          action: "trigger_webhook_reprocessing",
        },
      });
    }
  }

  // Store reconciliation records
  for (const result of results) {
    await prisma.paymentReconciliation.create({
      data: {
        tenantId: result.tenantId,
        paymentOrderId: result.paymentOrderId,
        provider: "payu",
        checkType: "webhook_vs_verify",
        status: result.status,
        detailsJson: result.details,
      },
    });
  }

  return results;
}

// ─── RECONCILE SPECIFIC PAYMENT ────────────────────────────────────────

export async function reconcileSpecificPayment(
  tenantId: string,
  paymentOrderId: string
): Promise<ReconciliationResult> {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  const payment = await prisma.paymentOrder.findUnique({
    where: { id: paymentOrderId },
  });

  if (!payment || payment.tenantId !== tenantId) {
    throw new Error("Payment order not found or access denied");
  }

  // Perform reconciliation
  if (!payment.payuTxnId) {
    return {
      paymentOrderId: payment.id,
      tenantId: payment.tenantId,
      status: "mismatched",
      details: {
        paymentStatus: payment.status,
        webhookReceived: false,
        webhookProcessed: false,
        source: "missing_payu_txn",
        action: "awaiting_payment_completion",
      },
    };
  }

  const webhook = await prisma.paymentWebhookEvent.findFirst({
    where: {
      providerTxnId: payment.payuTxnId,
      provider: "payu",
    },
  });

  if (!webhook) {
    return {
      paymentOrderId: payment.id,
      tenantId: payment.tenantId,
      status: "mismatched",
      details: {
        paymentStatus: payment.status,
        webhookReceived: false,
        webhookProcessed: false,
        source: "webhook_missing",
        action: "check_payu_webhook_delivery",
      },
    };
  }

  const webhookPayload = webhook.normalizedBodyJson as any;
  const expectedStatus =
    webhookPayload?.status === "success" ? "success" : "failed";
  const isMatched = payment.status === expectedStatus;

  return {
    paymentOrderId: payment.id,
    tenantId: payment.tenantId,
    status: isMatched ? "matched" : "mismatched",
    details: {
      paymentStatus: payment.status,
      webhookStatus: webhookPayload?.status,
      webhookReceived: true,
      webhookProcessed: webhook.processingStatus === "processed",
      source: "manual_check",
      action: isMatched ? "none" : "manual_review_required",
    },
  };
}

// ─── AUTOMATIC RECONCILIATION JOB (Can be scheduled) ───────────────────

export async function runAutomaticReconciliationJob(): Promise<{
  processed: number;
  matched: number;
  mismatched: number;
  resolved: number;
}> {
  console.log("[Reconciliation Job] Starting automatic reconciliation...");

  const results = await reconcileUnresolvedPayments();

  const stats = {
    processed: results.length,
    matched: results.filter((r) => r.status === "matched").length,
    mismatched: results.filter((r) => r.status === "mismatched").length,
    resolved: results.filter((r) => r.status === "resolved").length,
  };

  console.log("[Reconciliation Job] Completed:", stats);

  return stats;
}
