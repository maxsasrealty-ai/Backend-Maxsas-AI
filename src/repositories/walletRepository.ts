import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { assertUuid } from "../lib/uuid";
import {
  addLedgerEntry,
  formatPaise,
  getOrCreateWalletAccount,
  getWalletBalance as getLedgerWalletBalance,
  listWalletTransactions as listLedgerWalletTransactions,
  WalletLedgerEntry,
} from "./walletLedgerRepository";

export { formatPaise };

type LegacyWalletTransactionStatus = "pending" | "completed" | "failed";

type LegacyWalletTransaction = {
  id: string;
  tenantId: string;
  type: "credit" | "debit";
  amountPaise: number;
  description: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  status: LegacyWalletTransactionStatus;
  createdAt: Date;
};

function toLegacyStatus(status: WalletLedgerEntry["status"]): LegacyWalletTransactionStatus {
  if (status === "success") {
    return "completed";
  }
  return status === "reversed" ? "failed" : status;
}

function toLegacyTransaction(entry: WalletLedgerEntry): LegacyWalletTransaction {
  return {
    id: entry.id,
    tenantId: entry.tenantId,
    type: entry.direction,
    amountPaise: entry.amountMinor,
    description: entry.description,
    provider: entry.transactionSource || entry.referenceType || null,
    providerOrderId: entry.referenceId || entry.paymentOrderId || null,
    providerPaymentId: entry.externalTxnId || null,
    status: toLegacyStatus(entry.status),
    createdAt: new Date(entry.createdAt),
  };
}

export async function getWalletBalance(tenantId: string): Promise<number> {
  const balance = await getLedgerWalletBalance(tenantId);
  return balance.balanceMinor;
}

export async function insertTransaction(args: {
  tenantId: string;
  type: "credit" | "debit";
  amountPaise: number;
  description: string;
  provider?: string | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  status?: "pending" | "completed" | "failed";
}) {
  assertUuid(args.tenantId, "tenantId");
  const walletAccount = await getOrCreateWalletAccount(args.tenantId, undefined, prisma);

  const status = args.status === "completed" ? "success" : args.status === "failed" ? "failed" : "pending";

  const entry = await prisma.walletLedger.create({
    data: {
      tenantId: args.tenantId,
      walletAccountId: walletAccount.id,
      direction: args.type,
      amountMinor: BigInt(args.amountPaise),
      currency: "INR",
      status,
      entryType: args.type === "credit" ? "wallet_topup" : "usage_debit",
      paymentOrderId: args.providerOrderId || null,
      externalTxnId: args.providerPaymentId || null,
      referenceType: args.provider || null,
      referenceId: args.providerOrderId || null,
      description: args.description,
      metaJson: {
        source: "legacy_wallet_repository",
      },
      idempotencyKey: args.providerOrderId || `legacy_${walletAccount.id}_${Date.now()}`,
    },
  });

  return toLegacyTransaction({
    id: entry.id,
    tenantId: entry.tenantId,
    walletAccountId: entry.walletAccountId,
    direction: entry.direction as "credit" | "debit",
    amountMinor: Number(entry.amountMinor),
    currency: entry.currency,
    status: entry.status as WalletLedgerEntry["status"],
    entryType: entry.entryType,
    description: entry.description,
    externalTxnId: entry.externalTxnId || undefined,
    paymentOrderId: entry.paymentOrderId || undefined,
    referenceType: entry.referenceType || undefined,
    referenceId: entry.referenceId || undefined,
    transactionSource: entry.referenceType || entry.entryType,
    createdAt: entry.createdAt.toISOString(),
  });
}

export async function markTransactionCompleted(
  tenantId: string,
  providerOrderId: string,
  providerPaymentId?: string
) {
  assertUuid(tenantId, "tenantId");
  return prisma.walletLedger.updateMany({
    where: {
      tenantId,
      referenceId: providerOrderId,
      status: "pending",
    },
    data: {
      status: "success",
      ...(providerPaymentId ? { externalTxnId: providerPaymentId } : {}),
    },
  });
}

export async function markTransactionFailed(tenantId: string, providerOrderId: string) {
  assertUuid(tenantId, "tenantId");
  return prisma.walletLedger.updateMany({
    where: {
      tenantId,
      referenceId: providerOrderId,
      status: "pending",
    },
    data: { status: "failed" },
  });
}

async function updateTenantAndWalletBalance(args: {
  tenantId: string;
  amountPaise: number;
  direction: "credit" | "debit";
}) {
  const walletAccount = await getOrCreateWalletAccount(args.tenantId, undefined, prisma);
  await prisma.$transaction(async (tx) => {
    if (args.direction === "credit") {
      await tx.walletAccount.update({
        where: { id: walletAccount.id },
        data: {
          currentBalanceMinor: {
            increment: BigInt(args.amountPaise),
          },
        },
      });
      await tx.tenant.update({
        where: { id: args.tenantId },
        data: {
          walletBalancePaise: {
            increment: args.amountPaise,
          },
        },
      });
      return;
    }

    const currentWallet = await tx.walletAccount.findUnique({
      where: { id: walletAccount.id },
      select: { currentBalanceMinor: true },
    });

    if (!currentWallet || currentWallet.currentBalanceMinor < BigInt(args.amountPaise)) {
      throw new Error("Insufficient balance");
    }

    await tx.walletAccount.update({
      where: { id: walletAccount.id },
      data: {
        currentBalanceMinor: {
          decrement: BigInt(args.amountPaise),
        },
      },
    });
    await tx.tenant.update({
      where: { id: args.tenantId },
      data: {
        walletBalancePaise: {
          decrement: args.amountPaise,
        },
      },
    });
  });
}

export async function creditWalletBalance(tenantId: string, amountPaise: number) {
  assertUuid(tenantId, "tenantId");
  await updateTenantAndWalletBalance({ tenantId, amountPaise, direction: "credit" });
}

export async function debitWalletBalance(tenantId: string, amountPaise: number) {
  assertUuid(tenantId, "tenantId");
  await updateTenantAndWalletBalance({ tenantId, amountPaise, direction: "debit" });
}

export async function processIdempotentDebit(args: {
  tenantId: string;
  amountPaise: number;
  description: string;
  referenceId: string;
  db?: Prisma.TransactionClient | typeof prisma;
}) {
  assertUuid(args.tenantId, "tenantId");
  const client = args.db ?? prisma;
  const wallet = await getOrCreateWalletAccount(args.tenantId, undefined, client);

  const existing = await client.walletLedger.findUnique({
    where: {
      walletAccountId_idempotencyKey: {
        walletAccountId: wallet.id,
        idempotencyKey: args.referenceId,
      },
    },
  });

  if (existing) {
    if (existing.status === "success") {
      return { success: true, reason: "ALREADY_DEBITED", transaction: toLegacyTransaction({
        id: existing.id,
        tenantId: existing.tenantId,
        walletAccountId: existing.walletAccountId,
        direction: existing.direction as "credit" | "debit",
        amountMinor: Number(existing.amountMinor),
        currency: existing.currency,
        status: existing.status as WalletLedgerEntry["status"],
        entryType: existing.entryType,
        description: existing.description,
        externalTxnId: existing.externalTxnId || undefined,
        paymentOrderId: existing.paymentOrderId || undefined,
        referenceType: existing.referenceType || undefined,
        referenceId: existing.referenceId || undefined,
        transactionSource: existing.referenceType || existing.entryType,
        createdAt: existing.createdAt.toISOString(),
      }) };
    }
    if (existing.status === "failed") {
      return { success: false, reason: "PREVIOUS_FAILED", transaction: toLegacyTransaction({
        id: existing.id,
        tenantId: existing.tenantId,
        walletAccountId: existing.walletAccountId,
        direction: existing.direction as "credit" | "debit",
        amountMinor: Number(existing.amountMinor),
        currency: existing.currency,
        status: existing.status as WalletLedgerEntry["status"],
        entryType: existing.entryType,
        description: existing.description,
        externalTxnId: existing.externalTxnId || undefined,
        paymentOrderId: existing.paymentOrderId || undefined,
        referenceType: existing.referenceType || undefined,
        referenceId: existing.referenceId || undefined,
        transactionSource: existing.referenceType || existing.entryType,
        createdAt: existing.createdAt.toISOString(),
      }) };
    }
    return { success: false, reason: "PENDING_DEBIT", transaction: toLegacyTransaction({
      id: existing.id,
      tenantId: existing.tenantId,
      walletAccountId: existing.walletAccountId,
      direction: existing.direction as "credit" | "debit",
      amountMinor: Number(existing.amountMinor),
      currency: existing.currency,
      status: existing.status as WalletLedgerEntry["status"],
      entryType: existing.entryType,
      description: existing.description,
      externalTxnId: existing.externalTxnId || undefined,
      paymentOrderId: existing.paymentOrderId || undefined,
      referenceType: existing.referenceType || undefined,
      referenceId: existing.referenceId || undefined,
      transactionSource: existing.referenceType || existing.entryType,
      createdAt: existing.createdAt.toISOString(),
    }) };
  }

  const currentWallet = await client.walletAccount.findUnique({
    where: { id: wallet.id },
    select: { currentBalanceMinor: true },
  });

  if (!currentWallet || currentWallet.currentBalanceMinor < BigInt(args.amountPaise)) {
    const failedTxn = await client.walletLedger.create({
      data: {
        tenantId: args.tenantId,
        walletAccountId: wallet.id,
        direction: "debit",
        amountMinor: BigInt(args.amountPaise),
        currency: "INR",
        status: "failed",
        entryType: "usage_debit",
        description: args.description,
        referenceType: "usage",
        referenceId: args.referenceId,
        idempotencyKey: args.referenceId,
      },
    });

    return {
      success: false,
      reason: "INSUFFICIENT_BALANCE",
      transaction: toLegacyTransaction({
        id: failedTxn.id,
        tenantId: failedTxn.tenantId,
        walletAccountId: failedTxn.walletAccountId,
        direction: failedTxn.direction as "credit" | "debit",
        amountMinor: Number(failedTxn.amountMinor),
        currency: failedTxn.currency,
        status: failedTxn.status as WalletLedgerEntry["status"],
        entryType: failedTxn.entryType,
        description: failedTxn.description,
        externalTxnId: failedTxn.externalTxnId || undefined,
        paymentOrderId: failedTxn.paymentOrderId || undefined,
        referenceType: failedTxn.referenceType || undefined,
        referenceId: failedTxn.referenceId || undefined,
        transactionSource: failedTxn.referenceType || failedTxn.entryType,
        createdAt: failedTxn.createdAt.toISOString(),
      }),
    };
  }

  const successTxn = await addLedgerEntry({
    tenantId: args.tenantId,
    walletAccountId: wallet.id,
    direction: "debit",
    amountMinor: BigInt(args.amountPaise),
    entryType: "usage_debit",
    description: args.description,
    status: "success",
    idempotencyKey: args.referenceId,
    referenceType: "usage",
    referenceId: args.referenceId,
    db: args.db,
  });

  return {
    success: true,
    reason: "SUCCESS",
    transaction: toLegacyTransaction(successTxn),
  };
}

export async function listWalletTransactions(
  tenantId: string,
  page: number,
  pageSize: number
) {
  assertUuid(tenantId, "tenantId");
  const result = await listLedgerWalletTransactions({
    tenantId,
    page,
    pageSize,
    sortOrder: "desc",
  });

  return {
    items: result.entries.map(toLegacyTransaction),
    totalItems: result.total,
  };
}

export async function findTransactionByProviderOrderId(tenantId: string, providerOrderId: string) {
  assertUuid(tenantId, "tenantId");
  const result = await prisma.walletLedger.findFirst({
    where: { tenantId, referenceId: providerOrderId },
    orderBy: { createdAt: "desc" },
  });

  if (!result) {
    return null;
  }

  return toLegacyTransaction({
    id: result.id,
    tenantId: result.tenantId,
    walletAccountId: result.walletAccountId,
    direction: result.direction as "credit" | "debit",
    amountMinor: Number(result.amountMinor),
    currency: result.currency,
    status: result.status as WalletLedgerEntry["status"],
    entryType: result.entryType,
    description: result.description,
    externalTxnId: result.externalTxnId || undefined,
    paymentOrderId: result.paymentOrderId || undefined,
    referenceType: result.referenceType || undefined,
    referenceId: result.referenceId || undefined,
    transactionSource: result.referenceType || result.entryType,
    createdAt: result.createdAt.toISOString(),
  });
}
