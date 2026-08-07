export interface WorkspaceConfigOverrides {
  branding?: {
    productLabel?: string;
    workspaceLabel?: string;
    tenantDisplayName?: string;
    logoUrl?: string;
    primaryColor?: string;
    domain?: string;
  };
  vocabulary?: {
    leadsLabel?: string;
    batchesLabel?: string;
    callsLabel?: string;
    campaignsLabel?: string;
  };
  voiceAgentDisplay?: {
    assistantLabel?: string;
    defaultAgentLabel?: string;
  };
  tenantControl?: {
    version?: number;
    updatedAt?: string;
    sourceOfTruth?: "plan-default" | "manual-override" | "env" | "runtime" | "computed";
    profile?: {
      companyName?: string;
      ownerName?: string;
      ownerEmail?: string;
      ownerPhone?: string;
      workspaceLabel?: string;
      productLabel?: string;
      onboardingComplete?: boolean;
      status?: "active" | "trial" | "grace" | "suspended" | "archived";
      internalNotes?: string;
    };
    planBilling?: {
      planName?: "Lexus" | "Prestige" | "Enterprise";
      trialEndsAt?: string | null;
      graceEndsAt?: string | null;
      expiresAt?: string | null;
      billingBypass?: boolean;
      paymentLock?: boolean;
      walletBalancePaise?: number;
      internalNotes?: string;
    };
    features?: Record<string, boolean>;
    usageLimits?: {
      monthlyCallQuota?: number;
      maxConcurrentCalls?: number;
      leadUploadLimit?: number;
      storageGb?: number;
      seats?: number;
      campaignLimit?: number;
    };
    voiceCalling?: {
      outboundCallingEnabled?: boolean;
      assignedAgentDefault?: string;
      voiceTestMode?: boolean;
      callDurationLimitEnabled?: boolean;
      callDurationLimitSec?: import("./plans").CallDurationLimitSeconds | null;
      maxCallDurationSec?: number;
      voicemailPolicy?: "off" | "seconds-15" | "seconds-30" | "seconds-45";
      runtimePermissions?: string[];
    };
    accessSecurity?: {
      suspended?: boolean;
      resetAccess?: boolean;
      regenerateApiKeys?: boolean;
      revokeSessions?: boolean;
      impersonationAllowed?: boolean;
      adminOnlyLock?: boolean;
    };
    activity?: {
      adminNotes?: string;
      lastBackendSyncAt?: string | null;
      enterpriseAuditTrail?: Array<{
        at: string;
        actor: string;
        action: string;
        summary: string;
        sourceTenantId?: string | null;
      }>;
    };
    enterprise?: {
      enabled: boolean;
      origin: "create" | "convert" | "clone" | "manual" | "invite";
      provisionedAt: string | null;
      provisionedBy: string | null;
      sourceTenantId: string | null;
      adminUserId: string | null;
      adminEmail: string | null;
      credentialMode: "password" | "invite" | "reset" | "generated";
      inviteStatus: "none" | "pending" | "sent" | "activated" | "revoked";
      lastActionAt: string | null;
      lastActionBy: string | null;
    };
    dangerZone?: {
      hardBlockCampaignExecution?: boolean;
      freezeAccount?: boolean;
      archiveTenant?: boolean;
      deleteTenant?: boolean;
    };
  };
}

export type BackendControlSectionKey =
  | "runtime"
  | "integrations"
  | "processing"
  | "safety"
  | "observability"
  | "persistence";

export type BackendControlFieldType = "toggle" | "number" | "select" | "text" | "badge" | "readonly";

export type BackendControlVisibility = "developer" | "ops" | "admin";

export interface BackendControlFieldOption {
  label: string;
  value: string;
  description?: string;
}

export interface BackendControlFieldSchema {
  key: string;
  label: string;
  description?: string;
  type: BackendControlFieldType;
  section: BackendControlSectionKey;
  critical?: boolean;
  role?: BackendControlVisibility[];
  source?: "env" | "runtime" | "computed" | "readonly";
  min?: number;
  max?: number;
  step?: number;
  options?: BackendControlFieldOption[];
}

export interface BackendControlSectionSchema {
  key: BackendControlSectionKey;
  label: string;
  description: string;
  role?: BackendControlVisibility[];
  fields: BackendControlFieldSchema[];
}

export interface BackendControlSchema {
  version: number;
  sections: BackendControlSectionSchema[];
}

export interface BackendRuntimeControls {
  backendEnabled: boolean;
  maintenanceMode: boolean;
  webhookBridgeEnabled: boolean;
  voiceTestMode: boolean;
  billingBypass: boolean;
  queuePaused: boolean;
  outboundCallingEnabled: boolean;
  rateLimitMode: "off" | "soft" | "strict";
  autoRetryEnabled: boolean;
}

export interface BackendIntegrations {
  livekitUrl: string;
  livekitApiKeyState: "configured" | "missing";
  livekitApiSecretState: "configured" | "missing";
  sipTrunkId: string;
  webhookUrl: string;
  webhookTokenState: "configured" | "missing";
  agentServerUrl: string;
  paymentGatewayStatus: "configured" | "degraded" | "missing";
}

export interface BackendProcessingControls {
  outboundQueueConcurrency: number;
  webhookPollIntervalMs: number;
  eventRetryCount: number;
  eventRetryBaseDelayMs: number;
  requestTimeoutMs: number;
  maxCallDurationSec: number;
  voicemailAutoHangupPolicy: "off" | "seconds-15" | "seconds-30" | "seconds-45";
  classifierEnabled: boolean;
}

export interface BackendSafetyControls {
  perFeatureKillSwitches: Record<string, boolean>;
  dryRunMode: boolean;
  sandboxMode: boolean;
  tenantCapabilityOverride: "inherit" | "force-on" | "force-off";
  adminOnlyTriggerLock: boolean;
  emergencyStopCallCreation: boolean;
}

export interface BackendControlState {
  runtime: BackendRuntimeControls;
  integrations: BackendIntegrations;
  processing: BackendProcessingControls;
  safety: BackendSafetyControls;
}

export interface BackendControlAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  summary: string;
}

export interface BackendObservabilitySnapshot {
  backendHealth: "ok" | "degraded" | "down";
  queueDepth: number;
  webhookFailures: number;
  lastCallTriggerResult: string | null;
  lastEventIngest: string | null;
  recentConfigChanges: BackendControlAuditEntry[];
  auditLog: BackendControlAuditEntry[];
}

export interface BackendControlSourceMap {
  [section: string]: Record<string, "env" | "runtime" | "computed" | "readonly">;
}

export interface BackendControlSnapshot {
  schema: BackendControlSchema;
  state: BackendControlState;
  sources: BackendControlSourceMap;
  dirty: boolean;
  updatedAt: string | null;
  observability: BackendObservabilitySnapshot;
}

export interface BackendControlUpdateInput {
  runtime?: Partial<BackendRuntimeControls>;
  integrations?: Partial<BackendIntegrations>;
  processing?: Partial<BackendProcessingControls>;
  safety?: Partial<BackendSafetyControls> & {
    perFeatureKillSwitches?: Record<string, boolean>;
  };
}

export type BackendControlActionName =
  | "restart-worker"
  | "flush-queue"
  | "test-webhook"
  | "ping-livekit"
  | "sync-config"
  | "resume-queue"
  | "pause-queue";
