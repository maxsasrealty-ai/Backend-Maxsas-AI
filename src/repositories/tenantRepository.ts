import { PlanKey, Prisma, Tenant } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { assertUuid } from "../lib/uuid";

export async function upsertTenant(args: {
  tenantId: string;
  name?: string;
  plan?: PlanKey;
  workspaceConfigJson?: Prisma.InputJsonValue;
  featuresJson?: Prisma.InputJsonValue;
  walletBalancePaise?: number;
  allowEnterprise?: boolean;
}): Promise<Tenant> {
  const { tenantId, name, plan, workspaceConfigJson, featuresJson, walletBalancePaise, allowEnterprise } = args;
  assertUuid(tenantId, "tenantId");

  if (plan === "enterprise" && !allowEnterprise) {
    throw new Error("ENTERPRISE_PLAN_REQUIRES_ADMIN_PROVISIONING");
  }

  return prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name,
      plan: plan || "basic",
      workspaceConfigJson:
        typeof workspaceConfigJson !== "undefined" ? workspaceConfigJson : Prisma.JsonNull,
      ...(typeof featuresJson !== "undefined" ? { featuresJson } : {}),
      ...(typeof walletBalancePaise === "number" ? { walletBalancePaise } : {}),
    },
    update: {
      ...(name ? { name } : {}),
      ...(plan ? { plan } : {}),
      ...(typeof workspaceConfigJson !== "undefined" ? { workspaceConfigJson } : {}),
      ...(typeof featuresJson !== "undefined" ? { featuresJson } : {}),
      ...(typeof walletBalancePaise === "number" ? { walletBalancePaise } : {}),
    },
  });
}

export async function setTenantFeature(args: {
  tenantId: string;
  feature: "campaign_calls" | "analytics";
  value: boolean | "limited" | "full";
}): Promise<Tenant> {
  assertUuid(args.tenantId, "tenantId");

  const existing = await prisma.tenant.findUnique({
    where: { id: args.tenantId },
    select: {
      id: true,
      featuresJson: true,
    },
  });

  const base =
    existing?.featuresJson && typeof existing.featuresJson === "object" && !Array.isArray(existing.featuresJson)
      ? (existing.featuresJson as Record<string, unknown>)
      : {};

  const next = {
    ...base,
    [args.feature]: args.value,
  } as Prisma.InputJsonValue;

  return prisma.tenant.upsert({
    where: { id: args.tenantId },
    create: {
      id: args.tenantId,
      plan: "basic",
      featuresJson: next,
    },
    update: {
      featuresJson: next,
    },
  });
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  assertUuid(tenantId, "tenantId");
  return prisma.tenant.findUnique({ where: { id: tenantId } });
}

export async function listTenants(): Promise<Tenant[]> {
  return prisma.tenant.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getTenantUsageSummary(tenantId: string) {
  assertUuid(tenantId, "tenantId");
  const [
    totalCalls,
    activeCalls,
    completedCalls,
    failedCalls,
    duration,
    campaignCounts,
  ] = await Promise.all([
    prisma.callSession.count({ where: { tenantId } }),
    prisma.callSession.count({
      where: {
        tenantId,
        status: {
          in: ["initiated", "dispatching", "ringing", "connected", "active"],
        },
      },
    }),
    prisma.callSession.count({ where: { tenantId, status: "completed" } }),
    prisma.callSession.count({ where: { tenantId, status: "failed" } }),
    prisma.callSession.aggregate({
      where: { tenantId },
      _sum: {
        durationSec: true,
      },
    }),
    prisma.campaign.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: {
        status: true,
      },
    }),
  ]);

  const campaignSummary = {
    draft: 0,
    queued: 0,
    active: 0,
    completed: 0,
    archived: 0,
  };

  campaignCounts.forEach((item) => {
    campaignSummary[item.status] = item._count.status;
  });

  return {
    tenantId,
    callStats: {
      totalCalls,
      activeCalls,
      completedCalls,
      failedCalls,
      totalDurationMinutes: Number(((duration._sum.durationSec || 0) / 60).toFixed(1)),
    },
    campaignStats: {
      totalCampaigns: campaignSummary.draft + campaignSummary.queued + campaignSummary.active + campaignSummary.completed + campaignSummary.archived,
      ...campaignSummary,
    },
  };
}
