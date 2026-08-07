import {
    formatPaise,
    getOrCreateWalletAccount,
    getWalletBalance,
    listWalletTransactions,
} from "../repositories/walletLedgerRepository";

/**
 * Lexus Wallet Service
 * 
 * Provides wallet data for Lexus dashboard with proper formatting and
 * real-time updates from payment system.
 */

export interface LexusWalletDashboardData {
  currentBalance: {
    amountMinor: number;
    amountFormatted: string;
    currency: string;
  };
  statistics: {
    totalCreditsMinor: number;
    totalCreditsFormatted: string;
    totalDebitsMinor: number;
    totalDebitsFormatted: string;
    transactionCount: number;
  };
  recentTransactions: Array<{
    id: string;
    type: "credit" | "debit";
    amountPaise: number;
    amountFormatted: string;
    description: string;
    status: string;
    createdAt: string;
    externalTxnId?: string;
    paymentOrderId?: string;
  }>;
  pendingPayments: Array<{
    paymentOrderId: string;
    amountMinor: number;
    amountFormatted: string;
    status: string;
    createdAt: string;
  }>;
}

export async function getLexusWalletDashboardData(
  tenantId: string,
  _userId?: string
): Promise<LexusWalletDashboardData> {
  // Get wallet account
  const walletAccount = await getOrCreateWalletAccount(tenantId, _userId);

  // Get balance summary
  const balanceSummary = await getWalletBalance(tenantId, _userId);

  // Get recent transactions
  const { entries, total } = await listWalletTransactions({
    tenantId,
    page: 1,
    pageSize: 10,
    sortOrder: "desc",
  });

  // Format recent transactions for display
  const recentTransactions = entries.map((entry) => ({
    id: entry.id,
    type: entry.direction === "credit" ? "credit" : "debit",
    amountPaise: entry.amountMinor,
    amountFormatted: formatPaise(entry.amountMinor),
    description: entry.description,
    status: entry.status,
    createdAt: entry.createdAt,
    externalTxnId: entry.externalTxnId,
    paymentOrderId: entry.paymentOrderId,
  }));

  // Get pending payments (from payment orders in pending state)
  const { paymentOrders } = await import("../generated/prisma");
  // Note: This is a placeholder. Actual implementation would query PaymentOrder model.
  const pendingPayments: Array<any> = [];

  return {
    currentBalance: {
      amountMinor: balanceSummary.balanceMinor,
      amountFormatted: formatPaise(balanceSummary.balanceMinor),
      currency: balanceSummary.currency,
    },
    statistics: {
      totalCreditsMinor: balanceSummary.totalCreditsMinor,
      totalCreditsFormatted: formatPaise(balanceSummary.totalCreditsMinor),
      totalDebitsMinor: balanceSummary.totalDebitsMinor,
      totalDebitsFormatted: formatPaise(balanceSummary.totalDebitsMinor),
      transactionCount: total,
    },
    recentTransactions,
    pendingPayments,
  };
}
