export type TenantPlanTier = "lexus" | "enterprise";
export type FeatureName = "campaign_calls" | "analytics";

export interface TenantFeatureConfig {
  campaign_calls: boolean;
  analytics: "limited" | "full";
}

type TenantFeatureOverride = Partial<TenantFeatureConfig>;

const PLAN_FEATURES: Record<TenantPlanTier, TenantFeatureConfig> = {
  lexus: {
    campaign_calls: false,
    analytics: "limited",
  },
  enterprise: {
    campaign_calls: true,
    analytics: "full",
  },
};

export function resolveTenantPlanTier(plan?: string | null): TenantPlanTier {
  return plan === "enterprise" ? "enterprise" : "lexus";
}

export function getTenantFeatures(tenant: { plan?: string | null } | null | undefined): TenantFeatureConfig {
  const tier = resolveTenantPlanTier(tenant?.plan);
  const defaults = PLAN_FEATURES[tier];
  const overrides = parseTenantFeatureOverrides((tenant as { featuresJson?: unknown } | null | undefined)?.featuresJson);

  return {
    campaign_calls:
      typeof overrides.campaign_calls === "boolean"
        ? overrides.campaign_calls
        : defaults.campaign_calls,
    analytics:
      overrides.analytics === "limited" || overrides.analytics === "full"
        ? overrides.analytics
        : defaults.analytics,
  };
}

function parseTenantFeatureOverrides(raw: unknown): TenantFeatureOverride {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const input = raw as Record<string, unknown>;
  const next: TenantFeatureOverride = {};

  if (typeof input.campaign_calls === "boolean") {
    next.campaign_calls = input.campaign_calls;
  }

  if (input.analytics === "limited" || input.analytics === "full") {
    next.analytics = input.analytics;
  }

  return next;
}

export async function setTenantFeature(
  tenantId: string,
  feature: keyof TenantFeatureConfig,
  value: TenantFeatureConfig[keyof TenantFeatureConfig]
): Promise<void> {
  const { setTenantFeature: setTenantFeatureInRepo } = await import("../repositories/tenantRepository");
  await setTenantFeatureInRepo({
    tenantId,
    feature,
    value: value as boolean | "limited" | "full",
  });
}

export function enforceFeature(
  featureName: FeatureName,
  features: TenantFeatureConfig,
  options?: { analyticsLevel?: "limited" | "full" }
): void {
  if (featureName === "campaign_calls" && !features.campaign_calls) {
    throw new Error("FEATURE_FORBIDDEN:campaign_calls");
  }

  if (featureName === "analytics") {
    const requiredLevel = options?.analyticsLevel || "limited";
    if (requiredLevel === "full" && features.analytics !== "full") {
      throw new Error("FEATURE_FORBIDDEN:analytics");
    }
  }
}
