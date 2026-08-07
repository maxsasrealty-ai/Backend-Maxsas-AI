import { Prisma } from "../src/generated/prisma";
import { prisma } from "../src/lib/prisma";

type CliOptions = {
  tenantId?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let tenantId: string | undefined;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run" || arg === "--dryRun") {
      dryRun = true;
      continue;
    }

    if (arg === "--tenant" || arg === "--tenantId") {
      tenantId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--tenant=")) {
      tenantId = arg.slice("--tenant=".length);
      continue;
    }

    if (arg.startsWith("--tenantId=")) {
      tenantId = arg.slice("--tenantId=".length);
      continue;
    }
  }

  return { tenantId, dryRun };
}

async function recomputeWalletBalances(tenantIds: string[]): Promise<void> {
  for (const tenantId of tenantIds) {
    const walletAccounts = await prisma.walletAccount.findMany({
      where: { tenantId },
      select: { id: true, currentBalanceMinor: true },
    });

    for (const walletAccount of walletAccounts) {
      const aggregate = await prisma.walletLedger.aggregate({
        where: {
          walletAccountId: walletAccount.id,
          status: "success",
        },
        _sum: {
          amountMinor: true,
        },
      });

      const recomputedBalance = aggregate._sum.amountMinor ?? 0n;

      if (walletAccount.currentBalanceMinor !== recomputedBalance) {
        await prisma.walletAccount.update({
          where: { id: walletAccount.id },
          data: { currentBalanceMinor: recomputedBalance },
        });
      }
    }

    const updatedWallets = await prisma.walletAccount.findMany({
      where: { tenantId },
      select: { currentBalanceMinor: true },
    });

    const tenantBalance = updatedWallets.reduce((total, walletAccount) => total + Number(walletAccount.currentBalanceMinor), 0);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { walletBalancePaise: tenantBalance },
    });
  }
}

async function resetPayments(): Promise<void> {
  const { tenantId, dryRun } = parseArgs(process.argv.slice(2));
  const tenantWhere: Prisma.PaymentOrderWhereInput = tenantId ? { tenantId } : {};
  const paymentLedgerWhere: Prisma.WalletLedgerWhereInput = tenantId
    ? {
        tenantId,
        OR: [
          { paymentOrderId: { not: null } },
          { referenceType: "payu" },
          { paymentAttemptId: { not: null } },
        ],
      }
    : {
        OR: [
          { paymentOrderId: { not: null } },
          { referenceType: "payu" },
          { paymentAttemptId: { not: null } },
        ],
      };

  try {
    console.log("[payments-reset] starting", {
      scope: tenantId ? `tenant ${tenantId}` : "all tenants",
      dryRun,
    });

    const counts = {
      paymentOrders: await prisma.paymentOrder.count({ where: tenantWhere }),
      paymentAttempts: await prisma.paymentAttempt.count({ where: tenantId ? { tenantId } : {} }),
      paymentWebhooks: await prisma.paymentWebhookEvent.count({ where: tenantId ? { tenantId } : {} }),
      paymentReconciliations: await prisma.paymentReconciliation.count({ where: tenantId ? { tenantId } : {} }),
      paymentLedgerRows: await prisma.walletLedger.count({ where: paymentLedgerWhere }),
    };

    console.log("[payments-reset] planned cleanup counts", counts);

    if (dryRun) {
      console.log("[payments-reset] dry run complete - no data changed");
      return;
    }

    await prisma.paymentReconciliation.deleteMany({ where: tenantId ? { tenantId } : {} });
    await prisma.paymentWebhookEvent.deleteMany({ where: tenantId ? { tenantId } : {} });
    await prisma.paymentAttempt.deleteMany({ where: tenantId ? { tenantId } : {} });
    await prisma.walletLedger.deleteMany({ where: paymentLedgerWhere });
    await prisma.paymentOrder.deleteMany({ where: tenantWhere });

    const affectedWalletAccounts = await prisma.walletAccount.findMany({
      where: tenantId ? { tenantId } : {},
      select: { tenantId: true },
      distinct: ["tenantId"],
    });

    const affectedTenantIds = affectedWalletAccounts.map((walletAccount) => walletAccount.tenantId);

    await recomputeWalletBalances(affectedTenantIds);

    console.log("[payments-reset] cleanup complete", {
      affectedTenants: affectedTenantIds.length,
      paymentOrdersRemoved: counts.paymentOrders,
      paymentAttemptsRemoved: counts.paymentAttempts,
      paymentWebhooksRemoved: counts.paymentWebhooks,
      paymentReconciliationsRemoved: counts.paymentReconciliations,
      paymentLedgerRowsRemoved: counts.paymentLedgerRows,
    });
  } catch (error) {
    console.error("[payments-reset] failed", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void resetPayments();