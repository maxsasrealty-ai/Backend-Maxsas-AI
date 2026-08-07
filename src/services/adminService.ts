import { randomBytes, randomUUID, scryptSync } from "crypto";

import {
  CloneTenantIntoEnterpriseAdminInput,
  ConvertTenantToEnterpriseAdminInput,
  CreateEnterpriseTenantAdminInput,
  CreateTenantAdminInput,
  EnterpriseCredentialsAdminInput,
  EnterpriseInviteAdminInput,
  TenantControlCenterRecord,
  TenantAdminRecord,
  TenantUsageSummary,
  TenantWalletSummary,
  UpdateTenantAdminInput,
  WorkspaceConfigOverrides,
} from "../../shared/contracts";
import { PlanKey, Tenant } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import {
    getTenantById,
    getTenantUsageSummary,
    listTenants,
    upsertTenant,
} from "../repositories/tenantRepository";
import {
    formatPaise,
    getWalletBalance,
    listWalletTransactions,
} from "../repositories/walletRepository";
import {
  getCallBillingSummary,
  listCallBillingTransactions,
} from "../repositories/callBillingRepository";
import {
    getWorkspaceConfigForPlan,
  getPlanCapabilities,
    invalidateTenantCapabilityCache,
} from "./accessService";

type FallbackTenant = {
  id: string;
  name: string | null;
  plan: PlanKey;
  workspaceConfigJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const fallbackTenants = new Map<string, FallbackTenant>([
  [
    "lexus-demo",
    {
      id: "lexus-demo",
      name: "Lexus Demo",
      plan: "basic",
      workspaceConfigJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
]);

function isDbUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes("p1001") ||
    message.includes("econnrefused") ||
    message.includes("timed out")
  );
}

function shouldUseFallbackForError(error: unknown): boolean {
  return process.env.APP_ENV !== "production" && isDbUnavailableError(error);
}

function toTenantAdminRecordFromFallback(item: FallbackTenant, walletBalancePaise = 0): TenantAdminRecord {
  const workspaceConfig = getWorkspaceConfigForPlan(item.plan, {
    tenantDisplayName: item.name || undefined,
    overrides: parseWorkspaceOverrides(item.workspaceConfigJson),
  });

  return {
    id: item.id,
    name: item.name,
    planName: workspaceConfig.planName,
    workspaceConfig,
    walletBalancePaise,
    walletBalanceFormatted: formatPaise(walletBalancePaise),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    enterprise: resolveEnterpriseMetadata(item.workspaceConfigJson),
  };
}

function upsertFallbackTenant(args: {
  tenantId: string;
  name?: string;
  plan?: PlanKey;
  workspaceConfigJson?: string | null;
}): FallbackTenant {
  const existing = fallbackTenants.get(args.tenantId);
  const now = new Date();
  const next: FallbackTenant = {
    id: args.tenantId,
    name: typeof args.name === "undefined" ? existing?.name || null : args.name || null,
    plan: args.plan || existing?.plan || "basic",
    workspaceConfigJson:
      typeof args.workspaceConfigJson === "undefined"
        ? (existing?.workspaceConfigJson ?? null)
        : args.workspaceConfigJson,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  fallbackTenants.set(args.tenantId, next);
  return next;
}

function toPlanKey(planName?: string): PlanKey {
  switch ((planName || "Lexus").toLowerCase()) {
    case "prestige":
      return "pro";
    case "enterprise":
      return "enterprise";
    case "lexus":
    default:
      return "basic";
  }
}

function parseWorkspaceOverrides(raw?: unknown): WorkspaceConfigOverrides | undefined {
  if (!raw) {
    return undefined;
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as WorkspaceConfigOverrides;
  }

  if (typeof raw !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(raw) as WorkspaceConfigOverrides;
  } catch {
    return undefined;
  }
}

function parseJsonRecord(raw?: unknown): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function generateCredentialSecret(length = 20): string {
  return randomBytes(Math.ceil(length * 1.5)).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, length);
}

function normalizeAdminActor(actor?: string): string {
  return actor && actor.trim() ? actor.trim() : "master-control";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function buildEnterpriseAuditEntry(args: {
  actor?: string;
  action: string;
  summary: string;
  sourceTenantId?: string | null;
}): { at: string; actor: string; action: string; summary: string; sourceTenantId?: string | null } {
  return {
    at: new Date().toISOString(),
    actor: normalizeAdminActor(args.actor),
    action: args.action,
    summary: args.summary,
    sourceTenantId: args.sourceTenantId ?? null,
  };
}

function readEnterpriseAuditTrail(workspaceConfigJson?: string | null): Array<{ at: string; actor: string; action: string; summary: string; sourceTenantId?: string | null }> {
  const overrides = parseWorkspaceOverrides(workspaceConfigJson);
  const tenantControl = asObject(overrides?.tenantControl);
  const activity = asObject(tenantControl.activity);
  const trail = Array.isArray(activity.enterpriseAuditTrail) ? activity.enterpriseAuditTrail : [];

  return trail
    .map((entry) => {
      const record = asObject(entry);
      return {
        at: typeof record.at === "string" ? record.at : new Date().toISOString(),
        actor: typeof record.actor === "string" ? record.actor : "master-control",
        action: typeof record.action === "string" ? record.action : "enterprise-action",
        summary: typeof record.summary === "string" ? record.summary : "Enterprise action recorded",
        sourceTenantId: typeof record.sourceTenantId === "string" ? record.sourceTenantId : null,
      };
    })
    .filter((entry) => Boolean(entry.at && entry.actor && entry.action));
}

function resolveEnterpriseMetadata(workspaceConfigJson?: string | null) {
  const overrides = parseWorkspaceOverrides(workspaceConfigJson);
  const tenantControl = asObject(overrides?.tenantControl);
  const enterprise = asObject(tenantControl.enterprise);

  return {
    enabled: Boolean(enterprise.enabled || enterprise.provisionedAt || enterprise.provisionedBy),
    origin: (enterprise.origin as "create" | "convert" | "clone" | "manual" | "invite") || "manual",
    provisionedAt: typeof enterprise.provisionedAt === "string" ? enterprise.provisionedAt : null,
    provisionedBy: typeof enterprise.provisionedBy === "string" ? enterprise.provisionedBy : null,
    sourceTenantId: typeof enterprise.sourceTenantId === "string" ? enterprise.sourceTenantId : null,
    adminUserId: typeof enterprise.adminUserId === "string" ? enterprise.adminUserId : null,
    adminEmail: typeof enterprise.adminEmail === "string" ? enterprise.adminEmail : null,
    credentialMode: (enterprise.credentialMode as "password" | "invite" | "reset" | "generated") || "password",
    inviteStatus: (enterprise.inviteStatus as "none" | "pending" | "sent" | "activated" | "revoked") || "none",
    lastActionAt: typeof enterprise.lastActionAt === "string" ? enterprise.lastActionAt : null,
    lastActionBy: typeof enterprise.lastActionBy === "string" ? enterprise.lastActionBy : null,
  };
}

function withEnterpriseMetadata(record: TenantAdminRecord, workspaceConfigJson?: string | null): TenantAdminRecord {
  const enterprise = resolveEnterpriseMetadata(workspaceConfigJson);
  return {
    ...record,
    enterprise,
  };
}

function mergeTenantControlOverrides(
  workspaceConfigJson: string | null | undefined,
  mutator: (tenantControl: Record<string, unknown>) => void
): string {
  const overrides = parseWorkspaceOverrides(workspaceConfigJson) || {};
  const tenantControl = asObject(overrides.tenantControl);
  mutator(tenantControl);
  overrides.tenantControl = tenantControl;
  return JSON.stringify(overrides);
}

function mergeDeep<T>(base: T, overrides?: unknown): T {
  if (base === null || typeof base !== "object" || Array.isArray(base) || overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
    return (typeof overrides === "undefined" ? base : (overrides as T)) as T;
  }

  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    const currentValue = merged[key];
    if (currentValue && typeof currentValue === "object" && !Array.isArray(currentValue) && value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = mergeDeep(currentValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged as T;
}

function toTenantAdminRecord(item: Tenant, walletBalancePaise = 0): TenantAdminRecord {
  const plan = item.plan as PlanKey;
  const overrides = parseWorkspaceOverrides(item.workspaceConfigJson);
  const featuresJson = parseJsonRecord(item.featuresJson);
  const workspaceConfig = getWorkspaceConfigForPlan(plan, {
    tenantDisplayName: item.name || undefined,
    overrides,
  });

  return {
    id: item.id,
    name: item.name,
    planName: workspaceConfig.planName,
    workspaceConfig,
    featuresJson,
    walletBalancePaise: walletBalancePaise,
    walletBalanceFormatted: formatPaise(walletBalancePaise),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    enterprise: resolveEnterpriseMetadata(item.workspaceConfigJson as string | null),
  };
}

export async function listAdminTenants(): Promise<TenantAdminRecord[]> {
  try {
    const tenants = await listTenants();
    // Include real wallet balance for each tenant in the list
    const records = await Promise.all(
      tenants.map(async (t) => {
        const balance = await getWalletBalance(t.id);
        return withEnterpriseMetadata(toTenantAdminRecord(t, balance), t.workspaceConfigJson as string | null);
      })
    );
    return records;
  } catch (error) {
    if (!shouldUseFallbackForError(error)) {
      throw error;
    }

    return Array.from(fallbackTenants.values()).map((tenant) =>
      toTenantAdminRecordFromFallback(tenant, 0)
    );
  }
}

export async function getAdminTenantById(tenantId: string): Promise<TenantAdminRecord | null> {
  try {
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return null;
    }
    const balance = await getWalletBalance(tenantId);
    return withEnterpriseMetadata(toTenantAdminRecord(tenant, balance), tenant.workspaceConfigJson as string | null);
  } catch (error) {
    if (!shouldUseFallbackForError(error)) {
      throw error;
    }

    const fallback = fallbackTenants.get(tenantId);
    return fallback ? toTenantAdminRecordFromFallback(fallback, 0) : null;
  }
}

export async function createAdminTenant(input: CreateTenantAdminInput): Promise<TenantAdminRecord> {
  try {
    const created = await upsertTenant({
      tenantId: input.id,
      name: input.name,
      plan: toPlanKey(input.planName),
      workspaceConfigJson: input.workspaceConfigOverrides
        ? JSON.stringify(input.workspaceConfigOverrides)
        : undefined,
      featuresJson: input.featuresJson,
      walletBalancePaise: input.walletBalancePaise,
      allowEnterprise: input.planName === "Enterprise",
    });

    invalidateTenantCapabilityCache(created.id);
    return toTenantAdminRecord(created, 0);
  } catch (error) {
    if (!shouldUseFallbackForError(error)) {
      throw error;
    }

    const created = upsertFallbackTenant({
      tenantId: input.id,
      name: input.name,
      plan: toPlanKey(input.planName),
      workspaceConfigJson: input.workspaceConfigOverrides
        ? JSON.stringify(input.workspaceConfigOverrides)
        : undefined,
    });
    return toTenantAdminRecordFromFallback(created, 0);
  }
}

export async function updateAdminTenant(
  tenantId: string,
  input: UpdateTenantAdminInput
): Promise<TenantAdminRecord | null> {
  try {
    const existing = await getTenantById(tenantId);
    if (!existing) {
      return null;
    }

    const currentOverrides = parseWorkspaceOverrides(existing.workspaceConfigJson) || {};
    const mergedOverrides = input.workspaceConfigOverrides
      ? (mergeDeep(currentOverrides, input.workspaceConfigOverrides) as WorkspaceConfigOverrides)
      : currentOverrides;

    const updated = await upsertTenant({
      tenantId,
      name: input.name,
      plan: input.planName ? toPlanKey(input.planName) : undefined,
      workspaceConfigJson: input.workspaceConfigOverrides ? JSON.stringify(mergedOverrides) : undefined,
      featuresJson: input.featuresJson,
      walletBalancePaise: input.walletBalancePaise,
      allowEnterprise: input.planName === "Enterprise",
    });

    invalidateTenantCapabilityCache(tenantId);
    const balance = await getWalletBalance(tenantId);
    return withEnterpriseMetadata(toTenantAdminRecord(updated, balance), updated.workspaceConfigJson as string | null);
  } catch (error) {
    if (!shouldUseFallbackForError(error)) {
      throw error;
    }

    const existing = fallbackTenants.get(tenantId);
    if (!existing) {
      return null;
    }

    const currentOverrides = parseWorkspaceOverrides(existing.workspaceConfigJson) || {};
    const mergedOverrides = input.workspaceConfigOverrides
      ? (mergeDeep(currentOverrides, input.workspaceConfigOverrides) as WorkspaceConfigOverrides)
      : currentOverrides;

    const updated = upsertFallbackTenant({
      tenantId,
      name: input.name,
      plan: input.planName ? toPlanKey(input.planName) : undefined,
      workspaceConfigJson: input.workspaceConfigOverrides
        ? JSON.stringify(mergedOverrides)
        : undefined,
    });
    return toTenantAdminRecordFromFallback(updated, 0);
  }
}

export async function getAdminTenantUsage(tenantId: string): Promise<TenantUsageSummary | null> {
  try {
    const existing = await getTenantById(tenantId);
    if (!existing) {
      return null;
    }

    return getTenantUsageSummary(tenantId);
  } catch (error) {
    if (!shouldUseFallbackForError(error)) {
      throw error;
    }

    const fallback = fallbackTenants.get(tenantId);
    if (!fallback) {
      return null;
    }

    return {
      tenantId,
      callStats: {
        totalCalls: 0,
        activeCalls: 0,
        completedCalls: 0,
        failedCalls: 0,
        totalDurationMinutes: 0,
      },
      campaignStats: {
        totalCampaigns: 0,
        draft: 0,
        queued: 0,
        active: 0,
        completed: 0,
        archived: 0,
      },
    };
  }
}

export async function getAdminTenantWallet(tenantId: string): Promise<TenantWalletSummary | null> {
  try {
    const existing = await getTenantById(tenantId);
    if (!existing) {
      return null;
    }

    const balance = await getWalletBalance(tenantId);

    // Fetch recent transactions for summary aggregation (last 100 for totals)
    const { items } = await listWalletTransactions(tenantId, 1, 100);
    const callBillingSummary = await getCallBillingSummary(tenantId);
    const recentCallBillingTransactions = await listCallBillingTransactions({
      tenantId,
      page: 1,
      pageSize: 10,
    });

    let totalCreditPaise = 0;
    let totalDebitPaise = 0;
    let lastProvider: string | null = null;

    for (const item of items) {
      if (item.type === "credit" && item.status === "completed") {
        totalCreditPaise += item.amountPaise;
        if (!lastProvider && item.provider) {
          lastProvider = item.provider;
        }
      } else if (item.type === "debit" && item.status === "completed") {
        totalDebitPaise += item.amountPaise;
      }
    }

    const recentTransactions = items.slice(0, 5).map(item => ({
      id: item.id,
      tenantId: item.tenantId,
      type: item.type as "credit" | "debit",
      amountPaise: item.amountPaise,
      amountFormatted: `₹${(item.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      description: item.description,
      provider: item.provider,
      providerOrderId: item.providerOrderId,
      providerPaymentId: item.providerPaymentId,
      status: item.status as "pending" | "completed" | "failed",
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      tenantId,
      balancePaise: balance,
      balanceFormatted: formatPaise(balance),
      recentTransactionCount: items.length,
      totalCreditPaise,
      totalDebitPaise,
      lastProvider,
      callBillingSummary,
      recentTransactions,
      recentCallBillingTransactions: recentCallBillingTransactions.items.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        batchId: item.batchId,
        leadId: item.leadId,
        callId: item.callId,
        callDurationSeconds: item.callDurationSeconds,
        billedMinutes: item.billedMinutes,
        perMinuteRatePaise: item.perMinuteRatePaise,
        debitAmountPaise: item.debitAmountPaise,
        callStatus: item.callStatus,
        walletLedgerId: item.walletLedgerId,
        createdAt: item.createdAt,
      })),
    };
  } catch (error) {
    if (!shouldUseFallbackForError(error)) {
      throw error;
    }

    const fallback = fallbackTenants.get(tenantId);
    if (!fallback) {
      return null;
    }

    return {
      tenantId,
      balancePaise: 0,
      balanceFormatted: formatPaise(0),
      recentTransactionCount: 0,
      totalCreditPaise: 0,
      totalDebitPaise: 0,
      lastProvider: null,
      callBillingSummary: {
        totalCalls: 0,
        connectedCalls: 0,
        zeroChargeCalls: 0,
        billedMinutes: 0,
        debitAmountPaise: 0,
        perMinuteRatePaise: 540,
        batchSummaries: [],
      },
      recentTransactions: [],
      recentCallBillingTransactions: [],
    };
  }
}

async function upsertEnterpriseAdminUser(args: {
  tenantId: string;
  fullName: string;
  email: string;
  phone?: string;
  password?: string;
  mode: "generate" | "set" | "reset";
}): Promise<{ userId: string; email: string; password: string }> {
  const password = args.password || generateCredentialSecret(20);
  const passwordHash = hashPassword(password);
  const existing = await prisma.user.findFirst({
    where: {
      tenantId: args.tenantId,
      OR: [{ email: args.email }, { fullName: args.fullName }],
    },
    select: { id: true },
  });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: args.fullName,
          email: args.email,
          passwordHash,
        },
      })
    : await prisma.user.create({
        data: {
          tenantId: args.tenantId,
          fullName: args.fullName,
          email: args.email,
          passwordHash,
        },
      });

  return {
    userId: user.id,
    email: user.email,
    password,
  };
}

function buildEnterpriseTenantControlState(args: {
  companyName: string;
  adminFullName: string;
  adminEmail: string;
  adminPhone?: string;
  actor?: string;
  origin: "create" | "convert" | "clone" | "manual" | "invite";
  sourceTenantId?: string | null;
  inviteMode?: "password" | "invite";
  credentialMode?: "password" | "invite" | "reset" | "generated";
  inviteStatus?: "none" | "pending" | "sent" | "activated" | "revoked";
}) {
  const now = new Date().toISOString();
  const actor = normalizeAdminActor(args.actor);
  return {
    tenantControl: {
      version: 1,
      updatedAt: now,
      sourceOfTruth: "manual-override",
      profile: {
        companyName: args.companyName,
        ownerName: args.adminFullName,
        ownerEmail: args.adminEmail,
        ownerPhone: args.adminPhone || "",
        workspaceLabel: "Enterprise Workspace",
        productLabel: "MAXSAS AI",
        onboardingComplete: true,
        status: "active",
        internalNotes: "Enterprise account provisioned from Master Control",
      },
      planBilling: {
        planName: "Enterprise",
        billingBypass: true,
        paymentLock: false,
        walletBalancePaise: 0,
        internalNotes: "Master Control enterprise provisioning",
      },
      features: {
        calling: true,
        campaigns: true,
        leadUpload: true,
        analytics: true,
        exports: true,
        wallet: true,
        payments: true,
        liveMonitoring: true,
        webhookAccess: true,
        apiAccess: true,
        transcriptsVisibility: true,
        recordingsVisibility: true,
        planOverride: false,
      },
      usageLimits: {
        monthlyCallQuota: 120000,
        maxConcurrentCalls: 100,
        leadUploadLimit: 100000,
        storageGb: 250,
        seats: 50,
        campaignLimit: 100,
      },
      voiceCalling: {
        outboundCallingEnabled: true,
        assignedAgentDefault: "",
        voiceTestMode: false,
        maxCallDurationSec: 1800,
        voicemailPolicy: "seconds-30",
        runtimePermissions: [],
      },
      accessSecurity: {
        suspended: false,
        resetAccess: false,
        regenerateApiKeys: false,
        revokeSessions: false,
        impersonationAllowed: true,
        adminOnlyLock: true,
      },
      activity: {
        adminNotes: "",
        lastBackendSyncAt: now,
        enterpriseAuditTrail: [buildEnterpriseAuditEntry({
          actor,
          action: `enterprise-${args.origin}`,
          summary: `${args.origin === "clone" ? "Cloned" : args.origin === "convert" ? "Converted" : "Created"} enterprise tenant ${args.companyName}`,
          sourceTenantId: args.sourceTenantId || null,
        })],
      },
      enterprise: {
        enabled: true,
        origin: args.origin,
        provisionedAt: now,
        provisionedBy: actor,
        sourceTenantId: args.sourceTenantId || null,
        adminUserId: null,
        adminEmail: args.adminEmail,
        credentialMode: args.credentialMode || (args.inviteMode === "invite" ? "invite" : "password"),
        inviteStatus: args.inviteStatus || (args.inviteMode === "invite" ? "pending" : "none"),
        lastActionAt: now,
        lastActionBy: actor,
      },
    },
  };
}

async function persistEnterpriseTenant(args: {
  tenantId: string;
  name: string;
  plan: PlanKey;
  workspaceConfigJson: string;
  featuresJson?: Record<string, unknown>;
  walletBalancePaise?: number;
}) {
  return upsertTenant({
    tenantId: args.tenantId,
    name: args.name,
    plan: args.plan,
    workspaceConfigJson: args.workspaceConfigJson,
    featuresJson: args.featuresJson,
    walletBalancePaise: args.walletBalancePaise,
    allowEnterprise: true,
  });
}

export async function createEnterpriseTenant(input: CreateEnterpriseTenantAdminInput): Promise<TenantAdminRecord> {
  const tenantId = input.id || randomUUID();
  const workspaceConfig = buildEnterpriseTenantControlState({
    companyName: input.companyName,
    adminFullName: input.adminFullName,
    adminEmail: input.adminEmail,
    adminPhone: input.adminPhone,
    actor: input.actor,
    origin: "create",
    sourceTenantId: input.sourceTenantId || null,
    inviteMode: input.inviteMode,
    inviteStatus: input.enterpriseFlags?.inviteStatus,
  });
  const featuresJson = input.enabledFeatures || getPlanCapabilities("enterprise").features;
  const created = await persistEnterpriseTenant({
    tenantId,
    name: input.companyName,
    plan: "enterprise",
    workspaceConfigJson: JSON.stringify(workspaceConfig),
    featuresJson,
    walletBalancePaise: 0,
  });

  const credentials = await upsertEnterpriseAdminUser({
    tenantId: created.id,
    fullName: input.adminFullName,
    email: input.adminEmail,
    phone: input.adminPhone,
    password: input.initialPassword,
    mode: input.inviteMode === "invite" ? "generate" : "set",
  });

  const nextConfig = mergeTenantControlOverrides(created.workspaceConfigJson as string | null, (tenantControl) => {
    const enterprise = asObject(tenantControl.enterprise);
    tenantControl.enterprise = {
      ...enterprise,
      enabled: true,
      origin: "create",
      provisionedAt: new Date().toISOString(),
      provisionedBy: normalizeAdminActor(input.actor),
      sourceTenantId: input.sourceTenantId || null,
      adminUserId: credentials.userId,
      adminEmail: input.adminEmail,
      credentialMode: input.inviteMode === "invite" ? "invite" : "password",
      inviteStatus: input.enterpriseFlags?.inviteStatus || (input.inviteMode === "invite" ? "pending" : "none"),
      lastActionAt: new Date().toISOString(),
      lastActionBy: normalizeAdminActor(input.actor),
    };
  });

  const updated = await upsertTenant({
    tenantId: created.id,
    name: input.companyName,
    plan: "enterprise",
    workspaceConfigJson: nextConfig,
    featuresJson,
    walletBalancePaise: 0,
    allowEnterprise: true,
  });

  invalidateTenantCapabilityCache(updated.id);
  const balance = await getWalletBalance(updated.id);
  return withEnterpriseMetadata(toTenantAdminRecord(updated, balance), updated.workspaceConfigJson as string | null);
}

export async function convertTenantToEnterprise(
  tenantId: string,
  input: ConvertTenantToEnterpriseAdminInput
): Promise<TenantAdminRecord | null> {
  const existing = await getTenantById(tenantId);
  if (!existing) {
    return null;
  }

  const confirmed = input.confirmTenantName.trim().toLowerCase();
  const expected = (existing.name || tenantId).trim().toLowerCase();
  if (confirmed !== expected && confirmed !== tenantId.trim().toLowerCase()) {
    throw new Error("ENTERPRISE_CONFIRMATION_MISMATCH");
  }

  const featuresJson = input.migrateFeatures === false ? parseJsonRecord(existing.featuresJson) || undefined : getPlanCapabilities("enterprise").features;
  const workspaceConfig = buildEnterpriseTenantControlState({
    companyName: existing.name || tenantId,
    adminFullName: input.adminFullName || existing.name || "Enterprise Admin",
    adminEmail: input.adminEmail || `${tenantId}@example.com`,
    adminPhone: input.adminPhone,
    actor: input.actor,
    origin: "convert",
    sourceTenantId: tenantId,
    inviteMode: input.inviteMode,
    credentialMode: input.resetCredentials ? "reset" : input.inviteMode === "invite" ? "invite" : "generated",
    inviteStatus: input.inviteMode === "invite" ? "pending" : "none",
  });

  const nextConfig = mergeTenantControlOverrides(JSON.stringify(workspaceConfig), (tenantControl) => {
    tenantControl.enterprise = {
      ...(asObject(tenantControl.enterprise) || {}),
      enabled: true,
      origin: "convert",
      provisionedAt: new Date().toISOString(),
      provisionedBy: normalizeAdminActor(input.actor),
      sourceTenantId: tenantId,
      adminUserId: null,
      adminEmail: input.adminEmail || null,
      credentialMode: input.resetCredentials ? "reset" : input.inviteMode === "invite" ? "invite" : "generated",
      inviteStatus: input.inviteMode === "invite" ? "pending" : "none",
      lastActionAt: new Date().toISOString(),
      lastActionBy: normalizeAdminActor(input.actor),
    };
    tenantControl.activity = {
      ...(asObject(tenantControl.activity) || {}),
      enterpriseAuditTrail: [
        ...readEnterpriseAuditTrail(existing.workspaceConfigJson as string | null),
        buildEnterpriseAuditEntry({
          actor: input.actor,
          action: "enterprise-convert",
          summary: `Converted tenant ${tenantId} to enterprise`,
          sourceTenantId: tenantId,
        }),
      ],
    };
  });

  const updated = await upsertTenant({
    tenantId,
    name: existing.name || undefined,
    plan: "enterprise",
    workspaceConfigJson: nextConfig,
    featuresJson,
    allowEnterprise: true,
  });

  if (input.adminEmail || input.adminFullName || input.initialPassword) {
    const credentials = await upsertEnterpriseAdminUser({
      tenantId,
      fullName: input.adminFullName || existing.name || "Enterprise Admin",
      email: input.adminEmail || `${tenantId}@example.com`,
      phone: input.adminPhone,
      password: input.initialPassword,
      mode: input.resetCredentials ? "reset" : "set",
    });

    const patched = mergeTenantControlOverrides(updated.workspaceConfigJson as string | null, (tenantControl) => {
      const enterprise = asObject(tenantControl.enterprise);
      tenantControl.enterprise = {
        ...enterprise,
        adminUserId: credentials.userId,
        adminEmail: credentials.email,
        credentialMode: input.resetCredentials ? "reset" : "generated",
      };
    });

    const retouched = await upsertTenant({
      tenantId,
      name: existing.name || undefined,
      plan: "enterprise",
      workspaceConfigJson: patched,
      featuresJson,
      allowEnterprise: true,
    });

    invalidateTenantCapabilityCache(retouched.id);
    const balance = await getWalletBalance(retouched.id);
    return withEnterpriseMetadata(toTenantAdminRecord(retouched, balance), retouched.workspaceConfigJson as string | null);
  }

  invalidateTenantCapabilityCache(updated.id);
  const balance = await getWalletBalance(updated.id);
  return withEnterpriseMetadata(toTenantAdminRecord(updated, balance), updated.workspaceConfigJson as string | null);
}

export async function cloneTenantIntoEnterprise(
  sourceTenantId: string,
  input: CloneTenantIntoEnterpriseAdminInput
): Promise<TenantAdminRecord | null> {
  const existing = await getTenantById(sourceTenantId);
  if (!existing) {
    return null;
  }

  const targetTenantId = input.targetTenantId || randomUUID();
  const sourceOverrides = parseWorkspaceOverrides(existing.workspaceConfigJson) || {};
  const workspaceConfig = buildEnterpriseTenantControlState({
    companyName: input.targetCompanyName || existing.name || sourceTenantId,
    adminFullName: input.adminFullName,
    adminEmail: input.adminEmail,
    adminPhone: input.adminPhone,
    actor: input.actor,
    origin: "clone",
    sourceTenantId,
    inviteMode: input.inviteMode,
    credentialMode: input.inviteMode === "invite" ? "invite" : "password",
    inviteStatus: input.inviteMode === "invite" ? "pending" : "none",
  });

  const nextConfig = mergeTenantControlOverrides(JSON.stringify(workspaceConfig), (tenantControl) => {
    if (input.copyBranding !== false && sourceOverrides.branding) {
      tenantControl.branding = {
        ...asObject(tenantControl.branding),
        ...sourceOverrides.branding,
        tenantDisplayName: input.targetCompanyName || existing.name || sourceTenantId,
      };
    }

    if (input.copyLimits !== false && sourceOverrides.tenantControl?.usageLimits) {
      tenantControl.usageLimits = {
        ...asObject(tenantControl.usageLimits),
        ...sourceOverrides.tenantControl.usageLimits,
      };
    }

    if (input.copyFeatures !== false && sourceOverrides.tenantControl?.features) {
      tenantControl.features = {
        ...asObject(tenantControl.features),
        ...sourceOverrides.tenantControl.features,
      };
    }

    tenantControl.enterprise = {
      ...(asObject(tenantControl.enterprise) || {}),
      enabled: true,
      origin: "clone",
      provisionedAt: new Date().toISOString(),
      provisionedBy: normalizeAdminActor(input.actor),
      sourceTenantId,
      adminUserId: null,
      adminEmail: input.adminEmail,
      credentialMode: input.inviteMode === "invite" ? "invite" : "password",
      inviteStatus: input.inviteMode === "invite" ? "pending" : "none",
      lastActionAt: new Date().toISOString(),
      lastActionBy: normalizeAdminActor(input.actor),
    };
    tenantControl.activity = {
      ...(asObject(tenantControl.activity) || {}),
      enterpriseAuditTrail: [buildEnterpriseAuditEntry({
        actor: input.actor,
        action: "enterprise-clone",
        summary: `Cloned tenant ${sourceTenantId} into enterprise tenant ${targetTenantId}`,
        sourceTenantId,
      })],
    };
  });

  const created = await upsertTenant({
    tenantId: targetTenantId,
    name: input.targetCompanyName || existing.name || sourceTenantId,
    plan: "enterprise",
    workspaceConfigJson: nextConfig,
    featuresJson: input.copyFeatures === false ? undefined : (parseJsonRecord(existing.featuresJson) || undefined),
    allowEnterprise: true,
  });

  await upsertEnterpriseAdminUser({
    tenantId: created.id,
    fullName: input.adminFullName,
    email: input.adminEmail,
    phone: input.adminPhone,
    password: input.initialPassword,
    mode: input.inviteMode === "invite" ? "generate" : "set",
  });

  invalidateTenantCapabilityCache(created.id);
  const balance = await getWalletBalance(created.id);
  return withEnterpriseMetadata(toTenantAdminRecord(created, balance), created.workspaceConfigJson as string | null);
}

export async function updateEnterpriseCredentials(
  tenantId: string,
  input: EnterpriseCredentialsAdminInput
): Promise<{ tenant: TenantAdminRecord | null; password?: string }> {
  const existing = await getTenantById(tenantId);
  if (!existing) {
    return { tenant: null };
  }

  const mode = input.mode || "generate";
  const password = input.password || generateCredentialSecret(20);
  const credentials = await upsertEnterpriseAdminUser({
    tenantId,
    fullName: input.adminFullName || existing.name || "Enterprise Admin",
    email: input.adminEmail || `${tenantId}@example.com`,
    phone: input.adminPhone,
    password,
    mode,
  });

  const nextConfig = mergeTenantControlOverrides(existing.workspaceConfigJson as string | null, (tenantControl) => {
    tenantControl.enterprise = {
      ...(asObject(tenantControl.enterprise) || {}),
      enabled: true,
      origin: (asObject(tenantControl.enterprise).origin as string) || "manual",
      provisionedAt: (asObject(tenantControl.enterprise).provisionedAt as string) || new Date().toISOString(),
      provisionedBy: normalizeAdminActor(input.actor),
      sourceTenantId: (asObject(tenantControl.enterprise).sourceTenantId as string) || null,
      adminUserId: credentials.userId,
      adminEmail: credentials.email,
      credentialMode: mode === "set" ? "password" : mode === "reset" ? "reset" : "generated",
      inviteStatus: (asObject(tenantControl.enterprise).inviteStatus as "none" | "pending" | "sent" | "activated" | "revoked") || "none",
      lastActionAt: new Date().toISOString(),
      lastActionBy: normalizeAdminActor(input.actor),
    };
    tenantControl.activity = {
      ...(asObject(tenantControl.activity) || {}),
      enterpriseAuditTrail: [
        ...readEnterpriseAuditTrail(existing.workspaceConfigJson as string | null),
        buildEnterpriseAuditEntry({
          actor: input.actor,
          action: `enterprise-credentials-${mode}`,
          summary: `Updated enterprise credentials for tenant ${tenantId}`,
          sourceTenantId: tenantId,
        }),
      ],
    };
  });

  const updated = await upsertTenant({
    tenantId,
    name: existing.name || undefined,
    workspaceConfigJson: nextConfig,
    allowEnterprise: true,
  });

  invalidateTenantCapabilityCache(updated.id);
  const balance = await getWalletBalance(updated.id);
  return { tenant: withEnterpriseMetadata(toTenantAdminRecord(updated, balance), updated.workspaceConfigJson as string | null), password };
}

export async function createEnterpriseInvite(
  tenantId: string,
  input: EnterpriseInviteAdminInput
): Promise<{ tenant: TenantAdminRecord | null; inviteToken: string }> {
  const existing = await getTenantById(tenantId);
  if (!existing) {
    return { tenant: null, inviteToken: "" };
  }

  const inviteToken = generateCredentialSecret(32);
  const nextConfig = mergeTenantControlOverrides(existing.workspaceConfigJson as string | null, (tenantControl) => {
    tenantControl.enterprise = {
      ...(asObject(tenantControl.enterprise) || {}),
      enabled: true,
      origin: (asObject(tenantControl.enterprise).origin as string) || "manual",
      provisionedAt: (asObject(tenantControl.enterprise).provisionedAt as string) || new Date().toISOString(),
      provisionedBy: normalizeAdminActor(input.actor),
      sourceTenantId: (asObject(tenantControl.enterprise).sourceTenantId as string) || null,
      adminUserId: input.userId || (asObject(tenantControl.enterprise).adminUserId as string) || null,
      adminEmail: input.adminEmail || (asObject(tenantControl.enterprise).adminEmail as string) || null,
      credentialMode: "invite",
      inviteStatus: input.delivery === "activation" ? "pending" : "sent",
      lastActionAt: new Date().toISOString(),
      lastActionBy: normalizeAdminActor(input.actor),
      inviteToken,
    };
    tenantControl.activity = {
      ...(asObject(tenantControl.activity) || {}),
      enterpriseAuditTrail: [
        ...readEnterpriseAuditTrail(existing.workspaceConfigJson as string | null),
        buildEnterpriseAuditEntry({
          actor: input.actor,
          action: "enterprise-invite",
          summary: `Prepared enterprise invite for tenant ${tenantId}`,
          sourceTenantId: tenantId,
        }),
      ],
    };
  });

  const updated = await upsertTenant({
    tenantId,
    name: existing.name || undefined,
    workspaceConfigJson: nextConfig,
    allowEnterprise: true,
  });

  invalidateTenantCapabilityCache(updated.id);
  const balance = await getWalletBalance(updated.id);
  return { tenant: withEnterpriseMetadata(toTenantAdminRecord(updated, balance), updated.workspaceConfigJson as string | null), inviteToken };
}
