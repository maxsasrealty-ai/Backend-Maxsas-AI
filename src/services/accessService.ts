import { WorkspaceConfigOverrides } from "../../shared/contracts/admin";
import {
  CALL_DURATION_LIMIT_OPTIONS,
    CapabilityKey,
    PlanCapabilities,
    PlanKey,
  CallDurationLimitSeconds,
} from "../../shared/contracts/plans";
import { PlanName, WorkspaceTenantConfig } from "../../shared/contracts/workspace";
import { normalizeTenantId } from "../lib/tenant-id";
import { getTenantById, upsertTenant } from "../repositories/tenantRepository";

const PLAN_CAPABILITIES: Record<PlanKey, PlanCapabilities> = {
  basic: {
    plan: "basic",
    features: {
      "calls.live": true,
      "calls.history": true,
      "transcripts.partial": true,
      "transcripts.full": false,
      "recordings.playback": false,
      "analytics.basic": true,
      "analytics.advanced": false,
      "crm.sync": false,
      "whiteLabel.branding": false,
    },
    limits: {
      maxConcurrentCalls: 2,
      monthlyCallMinutes: 1200,
      retentionDays: 7,
    },
  },
  pro: {
    plan: "pro",
    features: {
      "calls.live": true,
      "calls.history": true,
      "transcripts.partial": true,
      "transcripts.full": true,
      "recordings.playback": true,
      "analytics.basic": true,
      "analytics.advanced": true,
      "crm.sync": true,
      "whiteLabel.branding": false,
    },
    limits: {
      maxConcurrentCalls: 10,
      monthlyCallMinutes: 10000,
      retentionDays: 30,
    },
  },
  enterprise: {
    plan: "enterprise",
    features: {
      "calls.live": true,
      "calls.history": true,
      "transcripts.partial": true,
      "transcripts.full": true,
      "recordings.playback": true,
      "analytics.basic": true,
      "analytics.advanced": true,
      "crm.sync": true,
      "whiteLabel.branding": true,
    },
    limits: {
      maxConcurrentCalls: 100,
      monthlyCallMinutes: 120000,
      retentionDays: 180,
    },
  },
};

const capabilityCache = new Map<
  string,
  { expiresAt: number; capabilities: PlanCapabilities; workspaceConfig: WorkspaceTenantConfig }
>();
const CAPABILITY_CACHE_TTL_MS = 30_000;

const LEXUS_VOCABULARY = {
  leadsLabel: "Leads",
  batchesLabel: "Batches",
  callsLabel: "Calls",
  campaignsLabel: "Campaigns",
} as const;

const ENTERPRISE_VOCABULARY = {
  leadsLabel: "Campaigns",
  batchesLabel: "Campaigns",
  callsLabel: "Calls",
  campaignsLabel: "Campaigns",
} as const;

function getPlanName(plan: PlanKey): PlanName {
  switch (plan) {
    case "pro":
      return "Prestige";
    case "enterprise":
      return "Enterprise";
    case "basic":
    default:
      return "Lexus";
  }
}

export function getWorkspaceConfigForPlan(
  plan: PlanKey,
  options?: { tenantDisplayName?: string; overrides?: WorkspaceConfigOverrides }
): WorkspaceTenantConfig {
  const planCapabilities = getPlanCapabilities(plan);
  const workspaceType = plan === "enterprise" ? "enterprise" : "lexus";

  const baseConfig: WorkspaceTenantConfig = {
    planName: getPlanName(plan),
    workspaceType,
    vocabulary: workspaceType === "enterprise" ? ENTERPRISE_VOCABULARY : LEXUS_VOCABULARY,
    branding: {
      productLabel: "MAXSAS AI",
      workspaceLabel: workspaceType === "enterprise" ? "Enterprise Workspace" : "Lexus Workspace",
      tenantDisplayName: options?.tenantDisplayName,
    },
    voiceAgentDisplay: {
      assistantLabel: "Voice AI",
      defaultAgentLabel: workspaceType === "enterprise" ? "Enterprise AI Agent" : "Lexus AI Agent",
    },
    voiceCalling: {
      callDurationLimitEnabled: false,
      callDurationLimitSec: null,
    },
    inventoryAwareAi: {
      inventoryAwareQualification: plan !== "basic",
      inventoryAwarePrompting: plan !== "basic",
    },
    capabilityFlags: planCapabilities.features,
  };

  if (!options?.overrides) {
    return normalizeWorkspaceConfig(baseConfig);
  }

  return normalizeWorkspaceConfig(mergeDeep(baseConfig, options.overrides) as WorkspaceTenantConfig);
}

export function normalizeCallDurationLimitSec(
  value: unknown
): CallDurationLimitSeconds | null {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return CALL_DURATION_LIMIT_OPTIONS.includes(parsed as CallDurationLimitSeconds)
    ? (parsed as CallDurationLimitSeconds)
    : null;
}

export function normalizeRequestedCallDurationLimitConfig(input?: {
  callDurationLimitEnabled?: unknown;
  callDurationLimitSec?: unknown;
} | null): {
  callDurationLimitEnabled: boolean;
  callDurationLimitSec: CallDurationLimitSeconds | null;
} {
  const rawEnabled = input?.callDurationLimitEnabled;
  const rawLimit = input?.callDurationLimitSec;
  const hasRequestedLimit = typeof rawLimit !== "undefined" && rawLimit !== null && rawLimit !== "";

  const enabled = typeof rawEnabled === "boolean" ? rawEnabled : hasRequestedLimit;
  if (!enabled) {
    return {
      callDurationLimitEnabled: false,
      callDurationLimitSec: null,
    };
  }

  const normalizedLimit = hasRequestedLimit ? normalizeCallDurationLimitSec(rawLimit) : CALL_DURATION_LIMIT_OPTIONS[0];
  if (hasRequestedLimit && normalizedLimit === null) {
    throw new Error(`callDurationLimitSec must be one of ${CALL_DURATION_LIMIT_OPTIONS.join(", ")} seconds or null`);
  }

  return {
    callDurationLimitEnabled: true,
    callDurationLimitSec: normalizedLimit ?? CALL_DURATION_LIMIT_OPTIONS[0],
  };
}

export function normalizeWorkspaceConfig(config: WorkspaceTenantConfig | Record<string, unknown>): WorkspaceTenantConfig {
  const workspaceConfig = config as WorkspaceTenantConfig & Record<string, unknown>;
  const directVoiceCalling = isPlainObject(workspaceConfig.voiceCalling) ? workspaceConfig.voiceCalling : {};
  const tenantControl = isPlainObject(workspaceConfig.tenantControl) ? workspaceConfig.tenantControl : {};
  const tenantControlVoiceCalling = isPlainObject((tenantControl as Record<string, unknown>).voiceCalling)
    ? (tenantControl as Record<string, unknown>).voiceCalling
    : {};

  return {
    ...workspaceConfig,
    voiceCalling: {
      callDurationLimitEnabled: Boolean(
        (directVoiceCalling as Record<string, unknown>).callDurationLimitEnabled ??
          (tenantControlVoiceCalling as Record<string, unknown>).callDurationLimitEnabled ??
          false
      ),
      callDurationLimitSec: Boolean(
        (directVoiceCalling as Record<string, unknown>).callDurationLimitEnabled ??
          (tenantControlVoiceCalling as Record<string, unknown>).callDurationLimitEnabled ??
          false
      )
        ? normalizeCallDurationLimitSec(
            (directVoiceCalling as Record<string, unknown>).callDurationLimitSec ??
              (tenantControlVoiceCalling as Record<string, unknown>).callDurationLimitSec ??
              null
          )
        : null,
    },
  };
}

function parseWorkspaceConfigOverrides(raw?: unknown): WorkspaceConfigOverrides | undefined {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep<T>(base: T, overrides?: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return (typeof overrides === "undefined" ? base : (overrides as T)) as T;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const currentValue = merged[key];
    if (isPlainObject(currentValue) && isPlainObject(value)) {
      merged[key] = mergeDeep(currentValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged as T;
}

export function getPlanCapabilities(plan: PlanKey): PlanCapabilities {
  return PLAN_CAPABILITIES[plan];
}

export async function getTenantCapabilities(tenantId: string): Promise<PlanCapabilities> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const tenant = await getTenantById(normalizedTenantId);
  if (!tenant) {
    const created = await upsertTenant({ tenantId: normalizedTenantId, plan: "basic" });
    return getPlanCapabilities(created.plan as PlanKey);
  }

  return getPlanCapabilities(tenant.plan as PlanKey);
}

export async function getCachedTenantCapabilities(tenantId: string): Promise<{
  tenantId: string;
  capabilities: PlanCapabilities;
  workspaceConfig: WorkspaceTenantConfig;
  cacheHit: boolean;
}> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const now = Date.now();
  const cached = capabilityCache.get(normalizedTenantId);

  if (cached && cached.expiresAt > now) {
    return {
      tenantId: normalizedTenantId,
      capabilities: cached.capabilities,
      workspaceConfig: cached.workspaceConfig,
      cacheHit: true,
    };
  }

  const tenant = await getTenantById(normalizedTenantId);
  const resolvedPlan = (tenant?.plan as PlanKey | undefined) || "basic";
  if (!tenant) {
    await upsertTenant({ tenantId: normalizedTenantId, plan: "basic" });
  }

  const capabilities = getPlanCapabilities(resolvedPlan);
  const workspaceConfig = getWorkspaceConfigForPlan(resolvedPlan, {
    tenantDisplayName: tenant?.name || undefined,
    overrides: parseWorkspaceConfigOverrides(tenant?.workspaceConfigJson),
  });

  capabilityCache.set(normalizedTenantId, {
    capabilities,
    workspaceConfig,
    expiresAt: now + CAPABILITY_CACHE_TTL_MS,
  });

  return {
    tenantId: normalizedTenantId,
    capabilities,
    workspaceConfig,
    cacheHit: false,
  };
}

export function hasCapability(plan: PlanKey, capability: CapabilityKey): boolean {
  return PLAN_CAPABILITIES[plan].features[capability] === true;
}

export function invalidateTenantCapabilityCache(tenantId?: string): void {
  if (!tenantId) {
    capabilityCache.clear();
    return;
  }

  capabilityCache.delete(tenantId);
}

export function assertCapability(plan: PlanKey, capability: CapabilityKey): void {
  if (!hasCapability(plan, capability)) {
    throw new Error(`Plan ${plan} does not include capability ${capability}`);
  }
}
