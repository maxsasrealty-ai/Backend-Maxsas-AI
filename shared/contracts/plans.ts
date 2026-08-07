export type PlanKey = "basic" | "pro" | "enterprise";

export type PlanName = "Lexus" | "Prestige" | "Enterprise";

export const CALL_DURATION_LIMIT_OPTIONS = [58, 118, 178] as const;

export type CallDurationLimitSeconds = (typeof CALL_DURATION_LIMIT_OPTIONS)[number];

export type CapabilityKey =
  | "calls.live"
  | "calls.history"
  | "transcripts.partial"
  | "transcripts.full"
  | "recordings.playback"
  | "analytics.basic"
  | "analytics.advanced"
  | "crm.sync"
  | "whiteLabel.branding";

export interface PlanCapabilities {
  plan: PlanKey;
  features: Record<CapabilityKey, boolean>;
  limits: {
    maxConcurrentCalls: number;
    monthlyCallMinutes: number;
    retentionDays: number;
  };
}

export interface WorkspaceTenantConfig {
  planName: PlanName;
  workspaceType: "lexus" | "enterprise";
  vocabulary: {
    leadsLabel: string;
    batchesLabel: string;
    callsLabel: string;
    campaignsLabel: string;
  };
  branding: {
    productLabel: string;
    workspaceLabel: string;
    tenantDisplayName?: string;
    logoUrl?: string;
    primaryColor?: string;
    domain?: string;
  };
  voiceAgentDisplay: {
    assistantLabel: string;
    defaultAgentLabel: string;
  };
  voiceCalling: {
    callDurationLimitEnabled: boolean;
    callDurationLimitSec: CallDurationLimitSeconds | null;
  };
  inventoryAwareAi: {
    inventoryAwareQualification: boolean;
    inventoryAwarePrompting: boolean;
  };
  capabilityFlags: Record<CapabilityKey, boolean>;
}