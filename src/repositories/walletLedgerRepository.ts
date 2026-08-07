import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { normalizeTenantId } from "../lib/tenant-id";
import { assertUuid } from "../lib/uuid";

type DbClient = Prisma.TransactionClient | typeof prisma;

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Wallet Ledger Repository
 * 
 * Handles all wallet ledger operations with proper isolation.
 * Double-entry accounting discipline - every credit/debit is logged.
 */

export interface WalletLedgerEntry {
  id: string;
  tenantId: string;
  walletAccountId: string;
  direction: "credit" | "debit";
  amountMinor: number;
  currency: string;
  status: "pending" | "success" | "failed" | "reversed";
  entryType: string;
  description: string;
  externalTxnId?: string;
  paymentOrderId?: string;
  referenceType?: string;
  referenceId?: string;
  transactionSource?: string;
  createdAt: string;
}

export interface WalletSummary {
  tenantId: string;
  userId?: string;
  balanceMinor: number;
  currency: string;
  totalCreditsMinor: number;
  totalDebitsMinor: number;
  pendingMinor: number;
  createdAt: string;
}

// ─── CREATE WALLET ACCOUNT ──────────────────────────────────────────────

export async function getOrCreateWalletAccount(
  tenantId: string,
  userId?: string,
  db: DbClient = prisma
) {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  if (userId && !userId.match(/^[\w-]+$/)) {
    throw new Error("Invalid userId format");
  }

  const createData = {
    tenantId,
    userId: userId ?? null,
    currency: "INR",
    status: "active",
    currentBalanceMinor: 0n,
  };

  if (userId) {
    // The composite unique key makes this path race-safe for user-scoped wallets.
    return db.walletAccount.upsert({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      update: {},
      create: createData,
    });
  }

  const createOrReuseTenantWallet = async (client: DbClient) => {
    // Lock the tenant row so only one transaction can create the singleton tenant wallet at a time.
    await client.$queryRaw`SELECT 1 FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;

    const existing = await client.walletAccount.findFirst({
      where: {
        tenantId,
        userId: null,
      },
    });

    if (existing) {
      return existing;
    }

    try {
      return await client.walletAccount.create({
        data: createData,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existingAfterRace = await client.walletAccount.findFirst({
          where: {
            tenantId,
            userId: null,
          },
        });

        if (existingAfterRace) {
          return existingAfterRace;
        }
      }

      throw error;
    }
  };

  if ("$transaction" in db) {
    return db.$transaction((tx) => createOrReuseTenantWallet(tx));
  }

  return createOrReuseTenantWallet(db);
}

// ─── ADD LEDGER ENTRY ───────────────────────────────────────────────────

export interface AddLedgerEntryRequest {
  tenantId: string;
  walletAccountId: string;
  direction: "credit" | "debit";
  amountMinor: bigint;
  entryType: string;
  description: string;
  status?: "pending" | "success" | "failed" | "reversed";
  idempotencyKey?: string;
  paymentOrderId?: string;
  externalTxnId?: string;
  referenceType?: string;
  referenceId?: string;
  metaJson?: Record<string, unknown>;
  db?: DbClient;
}

async function applyBalanceDelta(
  tx: DbClient,
  args: {
    tenantId: string;
    walletAccountId: string;
    direction: "credit" | "debit";
    amountMinor: bigint;
  }
) {
  const wallet = await tx.walletAccount.findUnique({
    where: { id: args.walletAccountId },
    select: { tenantId: true, currentBalanceMinor: true },
  });

  if (!wallet || wallet.tenantId !== args.tenantId) {
    throw new Error("Wallet not found or access denied");
  }

  if (args.direction === "debit") {
    if (wallet.currentBalanceMinor < args.amountMinor) {
      throw new Error("Insufficient balance");
    }

    await tx.walletAccount.update({
      where: { id: args.walletAccountId },
      data: {
        currentBalanceMinor: {
          decrement: args.amountMinor,
        },
      },
    });

    await tx.tenant.update({
      where: { id: args.tenantId },
      data: {
        walletBalancePaise: {
          decrement: Number(args.amountMinor),
        },
      },
    });
    return;
  }

  await tx.walletAccount.update({
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
}

export async function addLedgerEntry(
  req: AddLedgerEntryRequest
): Promise<WalletLedgerEntry> {
  const tenantId = normalizeTenantId(req.tenantId);
  assertUuid(tenantId, "tenantId");
  assertUuid(req.walletAccountId, "walletAccountId");

  // Generate idempotency key if not provided
  const idempotencyKey =
    req.idempotencyKey || `ledger_${req.walletAccountId}_${Date.now()}`;

  const run = async (tx: DbClient): Promise<WalletLedgerEntry> => {
    const wallet = await tx.walletAccount.findUnique({
      where: { id: req.walletAccountId },
      select: { tenantId: true },
    });

    if (!wallet || wallet.tenantId !== tenantId) {
      throw new Error("Wallet not found or access denied");
    }

    if (req.idempotencyKey) {
      const existing = await tx.walletLedger.findUnique({
        where: {
          walletAccountId_idempotencyKey: {
            walletAccountId: req.walletAccountId,
            idempotencyKey,
          },
        },
      });

      if (existing) {
        return {
          id: existing.id,
          tenantId: existing.tenantId,
          walletAccountId: existing.walletAccountId,
          direction: existing.direction as "credit" | "debit",
          amountMinor: Number(existing.amountMinor),
          currency: existing.currency,
          status: existing.status as "pending" | "success" | "failed" | "reversed",
          entryType: existing.entryType,
          description: existing.description,
          externalTxnId: existing.externalTxnId || undefined,
          paymentOrderId: existing.paymentOrderId || undefined,
          referenceType: existing.referenceType || undefined,
          referenceId: existing.referenceId || undefined,
          transactionSource: existing.referenceType || existing.entryType,
          createdAt: existing.createdAt.toISOString(),
        };
      }
    }

    const status = req.status ?? "success";
    const entry = await tx.walletLedger.create({
      data: {
        tenantId,
        walletAccountId: req.walletAccountId,
        direction: req.direction,
        amountMinor: req.amountMinor,
        currency: "INR",
        status,
        entryType: req.entryType as any,
        paymentOrderId: req.paymentOrderId || null,
        externalTxnId: req.externalTxnId || null,
        referenceType: req.referenceType || null,
        referenceId: req.referenceId || null,
        description: req.description,
        metaJson: req.metaJson as any || null,
        idempotencyKey,
      },
    });

    if (status === "success") {
      await applyBalanceDelta(tx, {
        tenantId,
        walletAccountId: req.walletAccountId,
        direction: req.direction,
        amountMinor: req.amountMinor,
      });
    }

    return {
      id: entry.id,
      tenantId: entry.tenantId,
      walletAccountId: entry.walletAccountId,
      direction: entry.direction as "credit" | "debit",
      amountMinor: Number(entry.amountMinor),
      currency: entry.currency,
      status: entry.status as "pending" | "success" | "failed" | "reversed",
      entryType: entry.entryType,
      description: entry.description,
      externalTxnId: entry.externalTxnId || undefined,
      paymentOrderId: entry.paymentOrderId || undefined,
      referenceType: entry.referenceType || undefined,
      referenceId: entry.referenceId || undefined,
      transactionSource: entry.referenceType || entry.entryType,
      createdAt: entry.createdAt.toISOString(),
    };
  };

  return req.db ? run(req.db) : prisma.$transaction((tx) => run(tx));
}

// ─── GET WALLET BALANCE ──────────────────────────────────────────────────

export async function getWalletBalance(
  tenantId: string,
  userId?: string
): Promise<WalletSummary> {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  const wallet = await getOrCreateWalletAccount(tenantId, userId);

  const [walletBalance, totalCredits, totalDebits, pendingTotal] = await Promise.all([
    prisma.walletAccount.findUnique({
      where: { id: wallet.id },
      select: { currentBalanceMinor: true },
    }),
    prisma.walletLedger.aggregate({
      where: {
        tenantId,
        walletAccountId: wallet.id,
        status: "success",
        direction: "credit",
      },
      _sum: { amountMinor: true },
    }),
    prisma.walletLedger.aggregate({
      where: {
        tenantId,
        walletAccountId: wallet.id,
        status: "success",
        direction: "debit",
      },
      _sum: { amountMinor: true },
    }),
    prisma.walletLedger.aggregate({
      where: {
        tenantId,
        walletAccountId: wallet.id,
        status: "pending",
      },
      _sum: { amountMinor: true },
    }),
  ]);

  return {
    tenantId,
    userId,
    balanceMinor: Number(walletBalance?.currentBalanceMinor ?? 0n),
    currency: "INR",
    totalCreditsMinor: Number(totalCredits._sum.amountMinor ?? 0n),
    totalDebitsMinor: Number(totalDebits._sum.amountMinor ?? 0n),
    pendingMinor: Number(pendingTotal._sum.amountMinor ?? 0n),
    createdAt: wallet.createdAt.toISOString(),
  };
}

// ─── LIST TRANSACTIONS ──────────────────────────────────────────────────

export interface ListTransactionsOptions {
  tenantId: string;
  userId?: string;
  status?: "pending" | "success" | "failed" | "reversed";
  entryType?: string;
  page?: number;
  pageSize?: number;
  sortOrder?: "asc" | "desc";
}

export async function listWalletTransactions(
  opts: ListTransactionsOptions
): Promise<{ entries: WalletLedgerEntry[]; total: number }> {
  const tenantId = normalizeTenantId(opts.tenantId);
  assertUuid(tenantId, "tenantId");

  const page = opts.page || 1;
  const pageSize = opts.pageSize || 20;
  const skip = (page - 1) * pageSize;

  // Find wallet
  const wallet = await getOrCreateWalletAccount(tenantId, opts.userId);

  // Build filter
  const where: any = {
    tenantId,
    walletAccountId: wallet.id,
  };

  if (opts.status) {
    where.status = opts.status;
  }

  if (opts.entryType) {
    where.entryType = opts.entryType;
  }

  // Fetch entries and total count
  const [entries, total] = await Promise.all([
    prisma.walletLedger.findMany({
      where,
      orderBy: {
        createdAt: opts.sortOrder === "asc" ? "asc" : "desc",
      },
      skip,
      take: pageSize,
    }),
    prisma.walletLedger.count({ where }),
  ]);

  return {
    entries: entries.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      walletAccountId: e.walletAccountId,
      direction: e.direction as "credit" | "debit",
      amountMinor: Number(e.amountMinor),
      currency: e.currency,
      status: e.status as "pending" | "success" | "failed" | "reversed",
      entryType: e.entryType,
      description: e.description,
      externalTxnId: e.externalTxnId || undefined,
      paymentOrderId: e.paymentOrderId || undefined,
      referenceType: e.referenceType || undefined,
      referenceId: e.referenceId || undefined,
      transactionSource: e.referenceType || e.entryType,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
  };
}

// ─── REVERSE LEDGER ENTRY (REFUND) ──────────────────────────────────────

export async function reverseOrRefundEntry(
  tenantId: string,
  entryId: string,
  reason: string
): Promise<WalletLedgerEntry> {
  tenantId = normalizeTenantId(tenantId);
  assertUuid(tenantId, "tenantId");

  const originalEntry = await prisma.walletLedger.findUnique({
    where: { id: entryId },
  });

  if (!originalEntry || originalEntry.tenantId !== tenantId) {
    throw new Error("Entry not found or access denied");
  }

  if (originalEntry.status === "reversed") {
    throw new Error("Entry is already reversed");
  }

  // Mark original as reversed
  await prisma.walletLedger.update({
    where: { id: entryId },
    data: { status: "reversed" },
  });

  // Create reverse entry
  const reverseEntry = await prisma.$transaction(async (tx) => {
    await tx.walletLedger.update({
      where: { id: entryId },
      data: { status: "reversed" },
    });

    const entry = await tx.walletLedger.create({
      data: {
        tenantId,
        walletAccountId: originalEntry.walletAccountId,
        // Swap direction for reversal
        direction: originalEntry.direction === "credit" ? "debit" : "credit",
        amountMinor: originalEntry.amountMinor,
        currency: originalEntry.currency,
        status: "success",
        entryType: "refund",
        paymentOrderId: originalEntry.paymentOrderId,
        externalTxnId: originalEntry.externalTxnId,
        referenceType: originalEntry.referenceType,
        referenceId: `refund_${entryId}`,
        description: `Refund/Reversal of ${originalEntry.description} - Reason: ${reason}`,
        idempotencyKey: `refund_${entryId}_${Date.now()}`,
        metaJson: {
          originalEntryId: entryId,
          refundReason: reason,
        },
      },
    });

    await applyBalanceDelta(tx, {
      tenantId,
      walletAccountId: originalEntry.walletAccountId,
      direction: originalEntry.direction === "credit" ? "debit" : "credit",
      amountMinor: originalEntry.amountMinor,
    });

    return entry;
  });

  return {
    id: reverseEntry.id,
    tenantId: reverseEntry.tenantId,
    walletAccountId: reverseEntry.walletAccountId,
    direction: reverseEntry.direction as "credit" | "debit",
    amountMinor: Number(reverseEntry.amountMinor),
    currency: reverseEntry.currency,
    status: reverseEntry.status as "pending" | "success" | "failed" | "reversed",
    entryType: reverseEntry.entryType,
    description: reverseEntry.description,
    externalTxnId: reverseEntry.externalTxnId || undefined,
    paymentOrderId: reverseEntry.paymentOrderId || undefined,
    referenceType: reverseEntry.referenceType || undefined,
    referenceId: reverseEntry.referenceId || undefined,
    transactionSource: reverseEntry.referenceType || reverseEntry.entryType,
    createdAt: reverseEntry.createdAt.toISOString(),
  };
}

// ─── UTILITIES ──────────────────────────────────────────────────────────

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
