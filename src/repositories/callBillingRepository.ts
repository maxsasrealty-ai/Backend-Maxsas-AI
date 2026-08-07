import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { normalizeTenantId } from "../lib/tenant-id";
import { assertUuid } from "../lib/uuid";
import { addLedgerEntry, getOrCreateWalletAccount } from "./walletLedgerRepository";

type DbClient = Prisma.TransactionClient | typeof prisma;

const CALL_BILLING_PER_MINUTE_RATE_PAISE = 540;
const NON_CONNECTED_OUTCOMES = new Set([
  "call_failed",
  "busy_line",
  "busy",
  "invalid_number",
  "voicemail_detected",
  "user_no_response",
  "unanswered",
  "non_connected",
]);

export interface CallBillingTransactionRecord {
  id: string;
  tenantId: string;
  batchId: string | null;
  leadId: string | null;
  callId: string;
  walletAccountId: string;
  walletLedgerId: string | null;
  callDurationSeconds: number;
  billedMinutes: number;
  perMinuteRatePaise: number;
  debitAmountPaise: number;
  callStatus: string;
  transactionMetaJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallBillingBatchSummary {
  batchId: string | null;
  totalCalls: number;
  connectedCalls: number;
  billedMinutes: number;
  debitAmountPaise: number;
  lastBilledAt: string | null;
}

export interface CallBillingSummary {
  tenantId: string;
  totalCalls: number;
  connectedCalls: number;
  zeroChargeCalls: number;
  billedMinutes: number;
  debitAmountPaise: number;
  perMinuteRatePaise: number;
  batchSummaries: CallBillingBatchSummary[];
}

export interface ListCallBillingTransactionsOptions {
  tenantId: string;
  batchId?: string | null;
  page?: number;
  pageSize?: number;
  db?: DbClient;
}

function toRecord(entry: {
  id: string;
  tenantId: string;
  batchId: string | null;
  leadId: string | null;
  callId: string;
  walletAccountId: string;
  walletLedgerId: string | null;
  callDurationSeconds: number;
  billedMinutes: number;
  perMinuteRatePaise: number;
  debitAmountPaise: number;
  callStatus: string;
  transactionMetaJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): CallBillingTransactionRecord {
  return {
    id: entry.id,
    tenantId: entry.tenantId,
    batchId: entry.batchId,
    leadId: entry.leadId,
    callId: entry.callId,
    walletAccountId: entry.walletAccountId,
    walletLedgerId: entry.walletLedgerId,
    callDurationSeconds: entry.callDurationSeconds,
    billedMinutes: entry.billedMinutes,
    perMinuteRatePaise: entry.perMinuteRatePaise,
    debitAmountPaise: entry.debitAmountPaise,
    callStatus: entry.callStatus,
    transactionMetaJson: (entry.transactionMetaJson as Record<string, unknown> | null) ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function deriveDurationSeconds(args: {
  callDurationSeconds?: number | null;
  connectedAt?: Date | null;
  completedAt?: Date | null;
}): number {
  if (typeof args.callDurationSeconds === "number" && Number.isFinite(args.callDurationSeconds)) {
    return Math.max(0, Math.round(args.callDurationSeconds));
  }

  if (args.connectedAt && args.completedAt) {
    return Math.max(0, Math.round((args.completedAt.getTime() - args.connectedAt.getTime()) / 1000));
  }

  return 0;
}

function deriveCallStatus(args: {
  connected: boolean;
  callStatus?: string | null;
  callOutcome?: string | null;
  sessionStatus?: string | null;
}): string {
  if (args.connected) {
    return "connected";
  }

  return args.callStatus || args.callOutcome || args.sessionStatus || "non_connected";
}

function isBillableConnectedCall(args: {
  connectedAt?: Date | null;
  durationSeconds: number;
  callOutcome?: string | null;
}): boolean {
  if (args.connectedAt) {
    return true;
  }

  if (args.durationSeconds <= 0) {
    return false;
  }

  if (!args.callOutcome) {
    return true;
  }

  return !NON_CONNECTED_OUTCOMES.has(args.callOutcome);
}

async function getCallContext(tx: DbClient, tenantId: string, callId: string) {
  return tx.callSession.findFirst({
    where: {
      id: callId,
      tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      connectedAt: true,
      completedAt: true,
      durationSec: true,
      callOutcome: true,
      endedBy: true,
      leadExtraction: {
        select: { id: true },
      },
      campaignLinks: {
        select: { campaignId: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function recordCallBillingTransaction(args: {
  tenantId: string;
  callId: string;
  callDurationSeconds?: number | null;
  callStatus?: string | null;
  callOutcome?: string | null;
  sourceEventId?: string;
  transactionMetaJson?: Record<string, unknown>;
  db?: DbClient;
}): Promise<CallBillingTransactionRecord> {
  const tenantId = normalizeTenantId(args.tenantId);
  assertUuid(tenantId, "tenantId");
  assertUuid(args.callId, "callId");

  const run = async (tx: DbClient): Promise<CallBillingTransactionRecord> => {
    const callSession = await getCallContext(tx, tenantId, args.callId);
    if (!callSession) {
      throw new Error("Call session not found or access denied");
    }

    const walletAccount = await getOrCreateWalletAccount(tenantId, undefined, tx);
    const durationSeconds = deriveDurationSeconds({
      callDurationSeconds: args.callDurationSeconds ?? callSession.durationSec,
      connectedAt: callSession.connectedAt,
      completedAt: callSession.completedAt,
    });
    const callOutcome = args.callOutcome || callSession.callOutcome || callSession.endedBy || null;
    const connected = isBillableConnectedCall({
      connectedAt: callSession.connectedAt,
      durationSeconds,
      callOutcome,
    });
    const billedMinutes = connected ? Math.max(1, Math.ceil(Math.max(1, durationSeconds) / 60)) : 0;
    const debitAmountPaise = billedMinutes * CALL_BILLING_PER_MINUTE_RATE_PAISE;
    const callStatus = deriveCallStatus({
      connected,
      callStatus: args.callStatus,
      callOutcome,
      sessionStatus: callSession.status,
    });
    const batchId = callSession.campaignLinks[0]?.campaignId ?? null;
    const leadId = callSession.leadExtraction?.id ?? null;
    const transactionMetaJson = {
      ...(args.transactionMetaJson || {}),
      sourceEventId: args.sourceEventId || null,
      callOutcome,
      endedBy: callSession.endedBy || null,
      connected,
      batchId,
      leadId,
      perMinuteRatePaise: CALL_BILLING_PER_MINUTE_RATE_PAISE,
    };

    const existing = await tx.callBillingTransaction.findUnique({
      where: {
        tenantId_callId: {
          tenantId,
          callId: args.callId,
        },
      },
    });

    const billingEntry = await tx.callBillingTransaction.upsert({
      where: {
        tenantId_callId: {
          tenantId,
          callId: args.callId,
        },
      },
      create: {
        tenantId,
        batchId,
        leadId,
        callId: args.callId,
        walletAccountId: walletAccount.id,
        callDurationSeconds: durationSeconds,
        billedMinutes,
        perMinuteRatePaise: CALL_BILLING_PER_MINUTE_RATE_PAISE,
        debitAmountPaise,
        callStatus,
        transactionMetaJson,
      },
      update: {
        batchId,
        leadId,
        walletAccountId: walletAccount.id,
        callDurationSeconds: durationSeconds,
        billedMinutes,
        perMinuteRatePaise: CALL_BILLING_PER_MINUTE_RATE_PAISE,
        debitAmountPaise,
        callStatus,
        transactionMetaJson,
      },
    });

    if (debitAmountPaise <= 0 || existing?.walletLedgerId) {
      return toRecord(billingEntry);
    }

    const ledgerEntry = await addLedgerEntry({
      tenantId,
      walletAccountId: walletAccount.id,
      direction: "debit",
      amountMinor: BigInt(debitAmountPaise),
      entryType: "usage_debit",
      description: `AI voice call billing for ${args.callId} (${billedMinutes} minute${billedMinutes === 1 ? "" : "s"})`,
      status: "success",
      referenceType: "call_billing",
      referenceId: args.callId,
      metaJson: transactionMetaJson,
      idempotencyKey: `call_billing:${args.callId}`,
      db: tx,
    });

    const updatedBilling = await tx.callBillingTransaction.update({
      where: {
        tenantId_callId: {
          tenantId,
          callId: args.callId,
        },
      },
      data: {
        walletLedgerId: ledgerEntry.id,
      },
    });

    return toRecord(updatedBilling);
  };

  return args.db ? run(args.db) : prisma.$transaction((tx) => run(tx));
}

export async function listCallBillingTransactions(
  opts: ListCallBillingTransactionsOptions
): Promise<{ items: CallBillingTransactionRecord[]; total: number }> {
  const tenantId = normalizeTenantId(opts.tenantId);
  assertUuid(tenantId, "tenantId");
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(Math.max(1, opts.pageSize || 20), 100);
  const where: Prisma.CallBillingTransactionWhereInput = {
    tenantId,
    ...(opts.batchId ? { batchId: opts.batchId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.callBillingTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.callBillingTransaction.count({ where }),
  ]);

  return {
    items: items.map(toRecord),
    total,
  };
}

export async function getCallBillingSummary(
  tenantId: string
): Promise<CallBillingSummary> {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  const rows = await prisma.callBillingTransaction.findMany({
    where: { tenantId },
    select: {
      batchId: true,
      billedMinutes: true,
      debitAmountPaise: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.totalCalls += 1;
      accumulator.billedMinutes += row.billedMinutes;
      accumulator.debitAmountPaise += row.debitAmountPaise;
      if (row.debitAmountPaise > 0) {
        accumulator.connectedCalls += 1;
      }
      return accumulator;
    },
    {
      totalCalls: 0,
      connectedCalls: 0,
      billedMinutes: 0,
      debitAmountPaise: 0,
    }
  );

  const batchMap = new Map<string | null, CallBillingBatchSummary>();
  for (const row of rows) {
    const key = row.batchId;
    const current = batchMap.get(key) || {
      batchId: key,
      totalCalls: 0,
      connectedCalls: 0,
      billedMinutes: 0,
      debitAmountPaise: 0,
      lastBilledAt: null,
    };

    current.totalCalls += 1;
    current.billedMinutes += row.billedMinutes;
    current.debitAmountPaise += row.debitAmountPaise;
    if (row.debitAmountPaise > 0) {
      current.connectedCalls += 1;
    }
    if (!current.lastBilledAt || row.createdAt > new Date(current.lastBilledAt)) {
      current.lastBilledAt = row.createdAt.toISOString();
    }

    batchMap.set(key, current);
  }

  const batchSummaries = Array.from(batchMap.values()).sort((left, right) => {
    const leftTime = left.lastBilledAt ? new Date(left.lastBilledAt).getTime() : 0;
    const rightTime = right.lastBilledAt ? new Date(right.lastBilledAt).getTime() : 0;
    return rightTime - leftTime;
  });

  return {
    tenantId,
    totalCalls: totals.totalCalls,
    connectedCalls: totals.connectedCalls,
    zeroChargeCalls: totals.totalCalls - totals.connectedCalls,
    billedMinutes: totals.billedMinutes,
    debitAmountPaise: totals.debitAmountPaise,
    perMinuteRatePaise: CALL_BILLING_PER_MINUTE_RATE_PAISE,
    batchSummaries,
  };
}