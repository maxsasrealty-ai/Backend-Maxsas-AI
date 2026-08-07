import { config } from "../../lib/config";
import { prisma } from "../../lib/db";
import { shouldBypassBilling } from "../../services/backendControlService";
import { processIdempotentDebit } from "../../repositories/walletRepository";

export const DEFAULT_OUTBOUND_CALL_CHARGE_PAISE = 1000;

export async function enforceWalletGuardOrBypass(args: {
  tenantId: string;
  amountPaise: number;
  callId: string;
  sourceEventId?: string;
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: args.tenantId },
    select: { id: true },
  });

  if (!tenant) {
    return { accepted: false, bypassed: false, reason: "TENANT_NOT_FOUND" };
  }

  const bypass = config.isTestMode || config.isBillingBypass || (await shouldBypassBilling());
  if (bypass) {
    await prisma.usageRecord.create({
      data: {
        tenantId: args.tenantId,
        callId: args.callId,
        usageType: "call_charge",
        amountPaise: args.amountPaise,
        status: "bypassed",
        sourceEventId: args.sourceEventId,
        notes: "Billing bypass enabled",
      },
    });

    return { accepted: true, bypassed: true };
  }

  const debitResult = await processIdempotentDebit({
    tenantId: args.tenantId,
    amountPaise: args.amountPaise,
    description: `Call charge for ${args.callId}`,
    referenceId: `usage:${args.callId}`,
  });

  if (!debitResult.success) {
    await prisma.usageRecord.create({
      data: {
        tenantId: args.tenantId,
        callId: args.callId,
        usageType: "call_charge",
        amountPaise: args.amountPaise,
        status: "rejected",
        sourceEventId: args.sourceEventId,
        notes: debitResult.reason,
      },
    });

    return { accepted: false, bypassed: false, reason: debitResult.reason };
  }

  await prisma.usageRecord.create({
    data: {
      tenantId: args.tenantId,
      callId: args.callId,
      usageType: "call_charge",
      amountPaise: args.amountPaise,
      status: "charged",
      sourceEventId: args.sourceEventId,
      notes: debitResult.transaction?.id ? `ledger:${debitResult.transaction.id}` : undefined,
    },
  });

  return { accepted: true, bypassed: false };
}
