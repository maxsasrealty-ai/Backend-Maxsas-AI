/**
 * Shared contracts between frontend and backend for outbound calling
 */

export interface InitiateCallRequest {
  tenantId: string;
  roomId: string;
  phoneNumber: string;
  agentName: string;
  direction: string;
  voiceCalling?: {
    callDurationLimitSec?: import("./contracts/plans").CallDurationLimitSeconds | null;
    callDurationLimitEnabled?: boolean;
  };
  callDurationLimitEnabled?: boolean;
  callDurationLimitSec?: import("./contracts/plans").CallDurationLimitSeconds | null;
}

export interface InitiateCallResponse {
  callId: string;
  tenantId: string;
  roomId: string;
  state: "queued";
  dispatch: {
    webhookUrl: string;
    eventAuthMode: "bearer";
    expectedHeaders: string[];
  };
}

import { LeadBucket } from "./leadOutcome";

export interface CallSummary {
  callId: string;
  tenantId: string;
  roomId: string;
  state: string;
  initiatedAt: string;
  connectedAt?: string;
  completedAt?: string;
  failedAt?: string;
  // Raw label provided by CRM / call analysis
  raw_call_outcome?: string | null;
  raw_call_outcome_confidence?: number | null;
  // Derived business bucket
  lead_bucket?: LeadBucket | null;
}

export interface CallDetail extends CallSummary {
  phoneNumber?: string;
  agentName?: string;
  direction?: string;
  durationSec?: number;
  recordingUrl?: string;
  transcript?: string;
}

export interface RecordingResponse {
  recordingId: string;
  roomId: string;
  createdAt: string;
  downloadUrl?: string;
  status: "available" | "processing" | "failed";
}

export interface AdminUserRecord {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  tenantName: string | null;
  createdAt: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
}

export interface TenantUsageSummary {
  tenantId: string;
  callStats: {
    totalCalls: number;
    activeCalls: number;
    completedCalls: number;
    failedCalls: number;
    totalDurationMinutes: number;
  };
  campaignStats: {
    totalCampaigns: number;
    draft: number;
    queued: number;
    active: number;
    completed: number;
    archived: number;
  };
}

export interface TenantWalletSummary {
  tenantId: string;
  balancePaise: number;
  balanceFormatted: string;
  recentTransactionCount: number;
  totalCreditPaise: number;
  totalDebitPaise: number;
  lastProvider: string | null;
  callBillingSummary?: {
    totalCalls: number;
    connectedCalls: number;
    zeroChargeCalls: number;
    billedMinutes: number;
    debitAmountPaise: number;
    perMinuteRatePaise: number;
    batchSummaries: Array<{
      batchId: string | null;
      totalCalls: number;
      connectedCalls: number;
      billedMinutes: number;
      debitAmountPaise: number;
      lastBilledAt: string | null;
    }>;
  };
  recentTransactions: Array<{
    id: string;
    tenantId: string;
    type: "credit" | "debit";
    amountPaise: number;
    amountFormatted: string;
    description: string;
    provider: string | null;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    status: "pending" | "completed" | "failed";
    createdAt: string;
  }>;
  recentCallBillingTransactions?: Array<{
    id: string;
    tenantId: string;
    batchId: string | null;
    leadId: string | null;
    callId: string;
    callDurationSeconds: number;
    billedMinutes: number;
    perMinuteRatePaise: number;
    debitAmountPaise: number;
    callStatus: string;
    walletLedgerId: string | null;
    createdAt: string;
  }>;
}

export interface TenantControlCenterRecord {
  meta: {
    version: number;
    updatedAt: string | null;
    sourceOfTruth: "plan-default" | "manual-override" | "env" | "runtime" | "computed";
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
  profile: {
    companyName: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
    workspaceLabel: string;
    productLabel: string;
    status: "active" | "trial" | "grace" | "suspended" | "archived";
    onboardingComplete: boolean;
    internalNotes: string;
  };
  planBilling: {
    planName: "Lexus" | "Prestige" | "Enterprise";
    trialEndsAt: string | null;
    graceEndsAt: string | null;
    expiresAt: string | null;
    billingBypass: boolean;
    paymentLock: boolean;
    walletBalancePaise: number;
    internalNotes: string;
  };
  features: Record<string, boolean>;
  usageLimits: {
    monthlyCallQuota: number;
    maxConcurrentCalls: number;
    leadUploadLimit: number;
    storageGb: number;
    seats: number;
    campaignLimit: number;
  };
  voiceCalling: {
    outboundCallingEnabled: boolean;
    assignedAgentDefault: string;
    voiceTestMode: boolean;
    callDurationLimitEnabled: boolean;
    callDurationLimitSec: import("./contracts/plans").CallDurationLimitSeconds | null;
    maxCallDurationSec: number;
    voicemailPolicy: "off" | "seconds-15" | "seconds-30" | "seconds-45";
    runtimePermissions: string[];
  };
  accessSecurity: {
    suspended: boolean;
    resetAccess: boolean;
    regenerateApiKeys: boolean;
    revokeSessions: boolean;
    impersonationAllowed: boolean;
    adminOnlyLock: boolean;
  };
  activity: {
    usageSummary: TenantUsageSummary | null;
    walletSummary: TenantWalletSummary | null;
    recentCalls: Array<{
      id: string;
      phoneNumber: string | null;
      status: string;
      initiatedAt: string;
      durationSec: number | null;
      transcriptTurns: number | null;
      recordingUrl: string | null;
      outcome: string | null;
    }>;
    recentLiveEvents: Array<{
      streamEventId: string;
      occurredAt: string;
      stage: string;
      tenantId?: string;
      callId?: string;
      eventType?: string;
      message?: string;
    }>;
    recentBackendActions: Array<{
      at: string;
      actor: string;
      action: string;
      summary: string;
    }>;
    enterpriseAuditTrail: Array<{
      at: string;
      actor: string;
      action: string;
      summary: string;
      sourceTenantId?: string | null;
    }>;
    lastWebhookStatus: string | null;
    lastBackendSyncAt: string | null;
  };
  dangerZone: {
    hardBlockCampaignExecution: boolean;
    freezeAccount: boolean;
    archiveTenant: boolean;
    deleteTenant: boolean;
  };
}

export interface TenantAdminRecord {
  id: string;
  name: string | null;
  planName: "Lexus" | "Prestige" | "Enterprise";
  workspaceConfig: Record<string, unknown>;
  featuresJson?: Record<string, unknown> | null;
  walletBalancePaise: number;
  walletBalanceFormatted: string;
  createdAt: string;
  updatedAt: string;
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
  controlCenter?: TenantControlCenterRecord;
}

export interface CreateTenantAdminInput {
  id: string;
  name?: string;
  planName?: "Lexus" | "Prestige" | "Enterprise";
  workspaceConfigOverrides?: import("./contracts/admin").WorkspaceConfigOverrides;
  featuresJson?: Record<string, unknown>;
  walletBalancePaise?: number;
}

export interface UpdateTenantAdminInput {
  name?: string;
  planName?: "Lexus" | "Prestige" | "Enterprise";
  workspaceConfigOverrides?: import("./contracts/admin").WorkspaceConfigOverrides;
  featuresJson?: Record<string, unknown>;
  walletBalancePaise?: number;
}

export interface CreateEnterpriseTenantAdminInput {
  id?: string;
  companyName: string;
  adminFullName: string;
  adminEmail: string;
  adminPhone?: string;
  initialPassword?: string;
  inviteMode?: "password" | "invite";
  sourceTenantId?: string | null;
  brandingDefaults?: {
    productLabel?: string;
    workspaceLabel?: string;
    logoUrl?: string;
    primaryColor?: string;
    domain?: string;
  };
  enabledFeatures?: Record<string, boolean>;
  usageLimits?: {
    monthlyCallQuota?: number;
    maxConcurrentCalls?: number;
    leadUploadLimit?: number;
    storageGb?: number;
    seats?: number;
    campaignLimit?: number;
  };
  enterpriseFlags?: {
    billingBypass?: boolean;
    adminOnlyLock?: boolean;
    impersonationAllowed?: boolean;
    inviteStatus?: "none" | "pending" | "sent" | "activated" | "revoked";
  };
  actor?: string;
  reason?: string;
}

export interface ConvertTenantToEnterpriseAdminInput {
  confirmTenantName: string;
  adminFullName?: string;
  adminEmail?: string;
  adminPhone?: string;
  migrateFeatures?: boolean;
  migrateLimits?: boolean;
  resetCredentials?: boolean;
  initialPassword?: string;
  inviteMode?: "password" | "invite";
  actor?: string;
  reason?: string;
}

export interface CloneTenantIntoEnterpriseAdminInput {
  targetTenantId?: string;
  targetCompanyName?: string;
  adminFullName: string;
  adminEmail: string;
  adminPhone?: string;
  initialPassword?: string;
  inviteMode?: "password" | "invite";
  copyFeatures?: boolean;
  copyLimits?: boolean;
  copyBranding?: boolean;
  actor?: string;
  reason?: string;
}

export interface EnterpriseCredentialsAdminInput {
  userId?: string;
  adminFullName?: string;
  adminEmail?: string;
  adminPhone?: string;
  password?: string;
  mode?: "generate" | "set" | "reset";
  actor?: string;
  reason?: string;
}

export interface EnterpriseInviteAdminInput {
  userId?: string;
  adminEmail?: string;
  delivery?: "invite" | "activation";
  actor?: string;
  reason?: string;
}

export * from "./contracts/admin";
export * from "./contracts/plans";
export * from "./contracts/workspace";
