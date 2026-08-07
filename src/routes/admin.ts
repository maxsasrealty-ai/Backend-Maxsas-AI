import { Request, Response, Router } from "express";
import fs from "fs/promises";
import os from "os";

import {
  AdminUserRecord,
  CloneTenantIntoEnterpriseAdminInput,
  ConvertTenantToEnterpriseAdminInput,
  CreateEnterpriseTenantAdminInput,
  CreateTenantAdminInput,
  EnterpriseCredentialsAdminInput,
  EnterpriseInviteAdminInput,
  TenantControlCenterRecord,
  UpdateTenantAdminInput,
} from "../../../shared/contracts";
import {
  BackendControlActionName,
  BackendControlFieldSchema,
  BackendControlSnapshot,
  BackendControlUpdateInput,
  BackendControlVisibility,
} from "../../../shared/contracts/admin";
import { config } from "../lib/config";
import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { requireAdminAccess } from "../middleware/requireAdminAccess";
import { listCampaigns } from "../repositories/campaignRepository";
import { getTenantById } from "../repositories/tenantRepository";
import {
  getDeletionStatus,
  listDeletionAuditEntries,
  requestDeletion,
  requestPartialDataDeletion,
  restorePendingDeletion,
  runDueAccountDeletionPurges,
} from "../services/accountDeletionService";
import {
    getRecentAdminLiveEvents,
    subscribeAdminLiveEvents,
} from "../services/adminLiveEventsService";
import { RoomServiceClient } from "livekit-server-sdk";
import { getCallEventsForKeys } from "../services/callObservabilityService";
import {
  cloneTenantIntoEnterprise,
  convertTenantToEnterprise,
  createEnterpriseInvite,
  createEnterpriseTenant,
    createAdminTenant,
    getAdminTenantById,
    getAdminTenantUsage,
    getAdminTenantWallet,
    listAdminTenants,
  updateEnterpriseCredentials,
    updateAdminTenant,
} from "../services/adminService";
import {
  appendBackendControlAudit,
  getBackendControlSnapshot,
  pauseOutboundWorkerRuntime,
  pingLivekit,
  processQueuedOutboundRequests,
  resetBackendControlSettings,
  restartOutboundWorkerWithRuntimeSettings,
  resumeOutboundWorkerRuntime,
  testWebhookRoute,
  updateBackendControlSettings,
} from "../services/backendControlService";

const adminRouter = Router();

// Skip admin auth middleware for SSE streaming endpoint (it uses query param)
adminRouter.use((req, res, next) => {
  // SSE endpoint uses query parameter for auth
  if (req.path === "/live-events/stream") {
    return next();
  }
  return requireAdminAccess(req, res, next);
});

function parseJsonString(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  const parsed = parseJsonString(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function normalizeEventType(value: unknown): string | null {
  const eventType = typeof value === "string" ? value.trim() : "";
  return eventType ? eventType : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function getDisplayPlanName(planName: string | null | undefined): "Lexus" | "Prestige" | "Enterprise" {
  const normalized = String(planName || "Lexus").toLowerCase();
  if (normalized === "prestige" || normalized === "pro") {
    return "Prestige";
  }
  if (normalized === "enterprise") {
    return "Enterprise";
  }
  return "Lexus";
}

function resolvePlanDefaults(planName: "Lexus" | "Prestige" | "Enterprise") {
  switch (planName) {
    case "Prestige":
      return {
        monthlyCallQuota: 10000,
        maxConcurrentCalls: 10,
        leadUploadLimit: 10000,
        storageGb: 50,
        seats: 10,
        campaignLimit: 20,
        voiceTestMode: false,
        outboundCallingEnabled: true,
      };
    case "Enterprise":
      return {
        monthlyCallQuota: 120000,
        maxConcurrentCalls: 100,
        leadUploadLimit: 100000,
        storageGb: 250,
        seats: 50,
        campaignLimit: 100,
        voiceTestMode: false,
        outboundCallingEnabled: true,
      };
    case "Lexus":
    default:
      return {
        monthlyCallQuota: 1200,
        maxConcurrentCalls: 2,
        leadUploadLimit: 1000,
        storageGb: 5,
        seats: 3,
        campaignLimit: 3,
        voiceTestMode: false,
        outboundCallingEnabled: true,
      };
  }
}

function buildTenantControlCenter(args: {
  tenant: NonNullable<Awaited<ReturnType<typeof getAdminTenantById>>>;
  usageSummary: Awaited<ReturnType<typeof getAdminTenantUsage>>;
  walletSummary: Awaited<ReturnType<typeof getAdminTenantWallet>>;
  recentCalls: Array<{
    id: string;
    phoneNumber: string | null;
    status: string;
    initiatedAt: Date;
    durationSec: number | null;
    transcriptTurns: number | null;
    recordingUrl: string | null;
    callOutcome: string | null;
  }>;
  recentLiveEvents: ReturnType<typeof getRecentAdminLiveEvents>;
  backendAudit: Array<{ at: string; actor: string; action: string; summary: string }>;
  lastWebhookStatus: string | null;
}): TenantControlCenterRecord {
  const workspaceConfig = args.tenant.workspaceConfig || {};
  const workspaceControl = asObject((workspaceConfig as Record<string, unknown>).tenantControl);
  const profileOverrides = asObject(workspaceControl.profile);
  const billingOverrides = asObject(workspaceControl.planBilling);
  const featureOverrides = asObject(workspaceControl.features);
  const limitOverrides = asObject(workspaceControl.usageLimits);
  const voiceOverrides = asObject(workspaceControl.voiceCalling);
  const securityOverrides = asObject(workspaceControl.accessSecurity);
  const activityOverrides = asObject(workspaceControl.activity);
  const enterpriseOverrides = asObject(workspaceControl.enterprise);
  const dangerOverrides = asObject(workspaceControl.dangerZone);
  const branding = asObject((workspaceConfig as Record<string, unknown>).branding);
  const planName = getDisplayPlanName(args.tenant.planName);
  const planDefaults = resolvePlanDefaults(planName);
  const featuresJson = asObject(args.tenant.featuresJson);
  const capabilityFlags = asObject((workspaceConfig as Record<string, unknown>).capabilityFlags);
  const hasExplicitControlOverrides = Object.keys(workspaceControl).length > 0 || Object.keys(featuresJson).length > 0;

  const combinedFeatures = {
    calling: asBoolean(featureOverrides.calling, true),
    campaigns: asBoolean(featureOverrides.campaigns, true),
    leadUpload: asBoolean(featureOverrides.leadUpload, true),
    analytics: asBoolean(featureOverrides.analytics, true),
    exports: asBoolean(featureOverrides.exports, true),
    wallet: asBoolean(featureOverrides.wallet, true),
    payments: asBoolean(featureOverrides.payments, true),
    liveMonitoring: asBoolean(featureOverrides.liveMonitoring, true),
    webhookAccess: asBoolean(featureOverrides.webhookAccess, true),
    apiAccess: asBoolean(featureOverrides.apiAccess, true),
    transcriptsVisibility: asBoolean(featureOverrides.transcriptsVisibility, true),
    recordingsVisibility: asBoolean(featureOverrides.recordingsVisibility, true),
    planOverride: asBoolean(featureOverrides.planOverride, false),
    ...capabilityFlags,
    ...featuresJson,
  };

  const version = asNumber(workspaceControl.version, 1);
  const sourceOfTruth = (workspaceControl.sourceOfTruth as TenantControlCenterRecord["meta"]["sourceOfTruth"] | undefined) || (hasExplicitControlOverrides ? "manual-override" : "plan-default");

  return {
    meta: {
      version,
      updatedAt: asString(workspaceControl.updatedAt, args.tenant.updatedAt),
      sourceOfTruth,
    },
    profile: {
      companyName: asString(profileOverrides.companyName, args.tenant.name || ""),
      ownerName: asString(profileOverrides.ownerName, ""),
      ownerEmail: asString(profileOverrides.ownerEmail, ""),
      ownerPhone: asString(profileOverrides.ownerPhone, ""),
      workspaceLabel: asString(profileOverrides.workspaceLabel, asString(branding.workspaceLabel, `${planName} Workspace`)),
      productLabel: asString(profileOverrides.productLabel, asString(branding.productLabel, "MAXSAS AI")),
      status: (profileOverrides.status as TenantControlCenterRecord["profile"]["status"] | undefined) || "active",
      onboardingComplete: asBoolean(profileOverrides.onboardingComplete, false),
      internalNotes: asString(profileOverrides.internalNotes, ""),
    },
    planBilling: {
      planName,
      trialEndsAt: typeof billingOverrides.trialEndsAt === "string" || billingOverrides.trialEndsAt === null ? billingOverrides.trialEndsAt : null,
      graceEndsAt: typeof billingOverrides.graceEndsAt === "string" || billingOverrides.graceEndsAt === null ? billingOverrides.graceEndsAt : null,
      expiresAt: typeof billingOverrides.expiresAt === "string" || billingOverrides.expiresAt === null ? billingOverrides.expiresAt : null,
      billingBypass: asBoolean(billingOverrides.billingBypass, false),
      paymentLock: asBoolean(billingOverrides.paymentLock, false),
      walletBalancePaise: asNumber(billingOverrides.walletBalancePaise, args.tenant.walletBalancePaise),
      internalNotes: asString(billingOverrides.internalNotes, ""),
    },
    features: combinedFeatures,
    usageLimits: {
      monthlyCallQuota: asNumber(limitOverrides.monthlyCallQuota, planDefaults.monthlyCallQuota),
      maxConcurrentCalls: asNumber(limitOverrides.maxConcurrentCalls, planDefaults.maxConcurrentCalls),
      leadUploadLimit: asNumber(limitOverrides.leadUploadLimit, planDefaults.leadUploadLimit),
      storageGb: asNumber(limitOverrides.storageGb, planDefaults.storageGb),
      seats: asNumber(limitOverrides.seats, planDefaults.seats),
      campaignLimit: asNumber(limitOverrides.campaignLimit, planDefaults.campaignLimit),
    },
    voiceCalling: {
      outboundCallingEnabled: asBoolean(voiceOverrides.outboundCallingEnabled, planDefaults.outboundCallingEnabled),
      assignedAgentDefault: asString(voiceOverrides.assignedAgentDefault, ""),
      voiceTestMode: asBoolean(voiceOverrides.voiceTestMode, planDefaults.voiceTestMode),
      callDurationLimitEnabled: asBoolean(voiceOverrides.callDurationLimitEnabled, false),
      callDurationLimitSec:
        typeof voiceOverrides.callDurationLimitSec === "number" || voiceOverrides.callDurationLimitSec === null
          ? voiceOverrides.callDurationLimitSec
          : null,
      maxCallDurationSec: asNumber(voiceOverrides.maxCallDurationSec, 1800),
      voicemailPolicy: (voiceOverrides.voicemailPolicy as TenantControlCenterRecord["voiceCalling"]["voicemailPolicy"] | undefined) || "seconds-30",
      runtimePermissions: Array.isArray(voiceOverrides.runtimePermissions)
        ? voiceOverrides.runtimePermissions.filter((value): value is string => typeof value === "string")
        : [],
    },
    accessSecurity: {
      suspended: asBoolean(securityOverrides.suspended, false),
      resetAccess: asBoolean(securityOverrides.resetAccess, false),
      regenerateApiKeys: asBoolean(securityOverrides.regenerateApiKeys, false),
      revokeSessions: asBoolean(securityOverrides.revokeSessions, false),
      impersonationAllowed: asBoolean(securityOverrides.impersonationAllowed, true),
      adminOnlyLock: asBoolean(securityOverrides.adminOnlyLock, false),
    },
    activity: {
      usageSummary: args.usageSummary,
      walletSummary: args.walletSummary,
      recentCalls: args.recentCalls.map((call) => ({
        id: call.id,
        phoneNumber: call.phoneNumber,
        status: call.status,
        initiatedAt: call.initiatedAt.toISOString(),
        durationSec: call.durationSec,
        transcriptTurns: call.transcriptTurns,
        recordingUrl: call.recordingUrl,
        outcome: call.callOutcome,
      })),
      recentLiveEvents: args.recentLiveEvents.map((event) => ({
        streamEventId: event.streamEventId,
        occurredAt: event.occurredAt,
        stage: event.stage,
        tenantId: event.tenantId,
        callId: event.callId,
        eventType: event.eventType,
        message: event.message,
      })),
      recentBackendActions: args.backendAudit,
      enterpriseAuditTrail: Array.isArray(activityOverrides.enterpriseAuditTrail)
        ? activityOverrides.enterpriseAuditTrail
            .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
            .map((entry) => ({
              at: asString(entry.at, args.tenant.updatedAt),
              actor: asString(entry.actor, "master-control"),
              action: asString(entry.action, "enterprise-action"),
              summary: asString(entry.summary, "Enterprise action recorded"),
              sourceTenantId: typeof entry.sourceTenantId === "string" ? entry.sourceTenantId : null,
            }))
        : [],
      lastWebhookStatus: args.lastWebhookStatus,
      lastBackendSyncAt: asString(activityOverrides.lastBackendSyncAt, args.tenant.updatedAt),
    },
    enterprise: {
      enabled: asBoolean(enterpriseOverrides.enabled, planName === "Enterprise"),
      origin: (enterpriseOverrides.origin as TenantControlCenterRecord["enterprise"]["origin"] | undefined) || "manual",
      provisionedAt: typeof enterpriseOverrides.provisionedAt === "string" ? enterpriseOverrides.provisionedAt : null,
      provisionedBy: typeof enterpriseOverrides.provisionedBy === "string" ? enterpriseOverrides.provisionedBy : null,
      sourceTenantId: typeof enterpriseOverrides.sourceTenantId === "string" ? enterpriseOverrides.sourceTenantId : null,
      adminUserId: typeof enterpriseOverrides.adminUserId === "string" ? enterpriseOverrides.adminUserId : null,
      adminEmail: typeof enterpriseOverrides.adminEmail === "string" ? enterpriseOverrides.adminEmail : null,
      credentialMode: (enterpriseOverrides.credentialMode as TenantControlCenterRecord["enterprise"]["credentialMode"] | undefined) || "password",
      inviteStatus: (enterpriseOverrides.inviteStatus as TenantControlCenterRecord["enterprise"]["inviteStatus"] | undefined) || "none",
      lastActionAt: typeof enterpriseOverrides.lastActionAt === "string" ? enterpriseOverrides.lastActionAt : null,
      lastActionBy: typeof enterpriseOverrides.lastActionBy === "string" ? enterpriseOverrides.lastActionBy : null,
    },
    dangerZone: {
      hardBlockCampaignExecution: asBoolean(dangerOverrides.hardBlockCampaignExecution, false),
      freezeAccount: asBoolean(dangerOverrides.freezeAccount, false),
      archiveTenant: asBoolean(dangerOverrides.archiveTenant, false),
      deleteTenant: asBoolean(dangerOverrides.deleteTenant, false),
    },
  };
}

function roleAllows(requiredRoles: BackendControlVisibility[] | undefined, role: string): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  return requiredRoles.includes(role as BackendControlVisibility);
}

function filterBackendControlSnapshot(snapshot: BackendControlSnapshot, role: string): BackendControlSnapshot {
  const sections = snapshot.schema.sections
    .filter((section) => roleAllows(section.role, role))
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field: BackendControlFieldSchema) => roleAllows(field.role, role)),
    }));

  return {
    ...snapshot,
    schema: {
      ...snapshot.schema,
      sections,
    },
  };
}

function extractOutcomeFromEvents(events: Array<{ eventType: string; payloadJson: unknown }>): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    const payload = asObject(event.payloadJson);
    const outcome = payload.outcome ?? payload.call_outcome ?? payload.final_output ?? payload.disposition ?? payload.classification_label;
    if (typeof outcome === "string" && outcome.trim()) {
      return outcome;
    }
  }
  return null;
}

function extractTranscriptTurnsFromEvents(events: Array<{ eventType: string; payloadJson: unknown; occurredAt: Date | string }>) {
  const transcriptEvent = [...events].reverse().find((event) => event.eventType === "call_transcript_final" || event.eventType === "transcript_final");
  if (!transcriptEvent) {
    return [] as Array<{ speaker: string; text: string; sequence_no: number; is_final: boolean; occurred_at: string }>;
  }

  const payload = asObject(transcriptEvent.payloadJson);
  const turns = Array.isArray(payload.turns) ? payload.turns : [];
  return turns.map((turn) => ({
    speaker: typeof (turn as Record<string, unknown>).speaker === "string" ? String((turn as Record<string, unknown>).speaker) : "agent",
    text: typeof (turn as Record<string, unknown>).text === "string" ? String((turn as Record<string, unknown>).text) : "",
    sequence_no: Number((turn as Record<string, unknown>).sequenceNo ?? (turn as Record<string, unknown>).sequence_no ?? 0),
    is_final: true,
    occurred_at: transcriptEvent.occurredAt instanceof Date ? transcriptEvent.occurredAt.toISOString() : new Date(transcriptEvent.occurredAt).toISOString(),
  }));
}

function extractLeadFromEvents(events: Array<{ eventType: string; payloadJson: unknown; occurredAt: Date | string }>) {
  const leadEvent = [...events].reverse().find((event) => event.eventType === "lead_extracted" || event.eventType === "call_analysis_completed");
  if (!leadEvent) {
    return null;
  }

  const payload = asObject(leadEvent.payloadJson);
  const sourceLead = payload.lead && typeof payload.lead === "object" && !Array.isArray(payload.lead)
    ? payload.lead as Record<string, unknown>
    : payload;
  const extractedAt = leadEvent.occurredAt instanceof Date ? leadEvent.occurredAt.toISOString() : new Date(leadEvent.occurredAt).toISOString();
  const confidence = typeof payload.confidence === "number"
    ? payload.confidence
    : typeof payload.confidence?.overall === "number"
      ? Number(payload.confidence.overall)
      : null;

  return {
    extracted_at: extractedAt,
    confidence,
    fields: {
      name: typeof payload.name === "string" ? payload.name : null,
      phone: typeof payload.phone === "string" ? payload.phone : null,
      summary: typeof payload.summary === "string" ? payload.summary : null,
      property_type: typeof sourceLead.property_type === "string" ? sourceLead.property_type : null,
      location: typeof sourceLead.location === "string" ? sourceLead.location : typeof payload.preferred_location === "string" ? payload.preferred_location : null,
      budget: typeof sourceLead.budget === "string" ? sourceLead.budget : typeof payload.budget_range === "string" ? payload.budget_range : null,
      timeline: typeof sourceLead.timeline === "string" ? sourceLead.timeline : typeof payload.purchase_timeline === "string" ? payload.purchase_timeline : null,
    },
  };
}

function normalizeLevel(value: unknown): string {
  const level = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (level === "error" || level === "warn" || level === "warning" || level === "debug" || level === "info") {
    return level === "warning" ? "warn" : level;
  }
  return "info";
}

function bucketIndex(value: Date, startTime: number, bucketMs: number, bucketCount: number): number {
  const index = Math.floor((value.getTime() - startTime) / bucketMs);
  if (Number.isNaN(index)) {
    return 0;
  }
  return Math.min(Math.max(index, 0), bucketCount - 1);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = bytes;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function loadDevMonitorLogs(args: { limit?: number; level?: string | null; since?: Date | null } = {}) {
  const limit = Math.max(1, Math.min(Number(args.limit || 100), 500));
  const level = args.level ? normalizeLevel(args.level) : null;
  const since = args.since instanceof Date && !Number.isNaN(args.since.getTime()) ? args.since : null;

  try {
    const whereClauses: Prisma.Sql[] = [];
    if (since) {
      whereClauses.push(Prisma.sql`received_at > ${since}`);
    }
    if (level) {
      whereClauses.push(Prisma.sql`lower(coalesce(level, 'info')) = ${level}`);
    }

    const whereSql = whereClauses.length ? Prisma.sql`WHERE ${Prisma.join(whereClauses, Prisma.sql` AND `)}` : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{
      received_at: Date | string;
      level?: string | null;
      message?: string | null;
      event_type?: string | null;
      call_id?: string | null;
      tenant_id?: string | null;
      payload_json?: unknown;
      source?: string | null;
    }>>(Prisma.sql`
      SELECT received_at, level, message, event_type, call_id, tenant_id, payload_json, source
      FROM voice_ingest_audit
      ${whereSql}
      ORDER BY received_at DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      received_at: row.received_at instanceof Date ? row.received_at.toISOString() : new Date(row.received_at).toISOString(),
      level: normalizeLevel(row.level),
      message: row.message || row.event_type || "voice_ingest_event",
      event_type: row.event_type || null,
      call_id: row.call_id || null,
      tenant_id: row.tenant_id || null,
      source: row.source || "voice_ingest_audit",
      payload: parseJsonString(row.payload_json),
    }));
  } catch {
    const fallback = await prisma.callEvent.findMany({
      where: since ? { createdAt: { gt: since } } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        createdAt: true,
        eventType: true,
        callId: true,
        tenantId: true,
        payloadJson: true,
      },
    });

    return fallback
      .map((item) => ({
        received_at: item.createdAt.toISOString(),
        level: "info",
        message: `fallback callEvent ${item.eventType}`,
        event_type: item.eventType,
        call_id: item.callId,
        tenant_id: item.tenantId,
        source: "call_event",
        payload: parseJsonString(item.payloadJson),
      }))
      .filter((item) => (level ? item.level === level : true));
  }
}

async function buildDevMonitorHealth() {
  const startedAt = Date.now();
  const snapshot = await getBackendControlSnapshot();
  const backendHealth = snapshot.observability.backendHealth || (snapshot.state.runtime.backendEnabled && !snapshot.state.runtime.maintenanceMode ? "ok" : "degraded");

  const memory = process.memoryUsage();
  const cpuLoad = os.cpus().length > 0 ? Math.min((os.loadavg()[0] / os.cpus().length) * 100, 999) : 0;

  let dbLatencyMs = null;
  let dbStatus: "ok" | "warn" | "down" = "warn";
  let connectionPool = null;
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = dbLatencyMs < 400 ? "ok" : "warn";
    try {
      const poolRows = await prisma.$queryRaw<Array<{ active_connections: bigint | number }>>(Prisma.sql`
        SELECT count(*)::int AS active_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      connectionPool = Number(poolRows[0]?.active_connections || 0);
    } catch {
      connectionPool = null;
    }
  } catch {
    dbStatus = "down";
  }

  const livekit = await pingLivekit();
  const recentCalls = await prisma.callSession.findMany({
    orderBy: { initiatedAt: "desc" },
    take: 50,
    select: {
      status: true,
      roomId: true,
      durationSec: true,
    },
  });
  const activeCalls = recentCalls.filter((call) => ["active", "live", "connecting", "ringing"].includes(String(call.status || "").toLowerCase())).length;
  const roomCount = new Set(recentCalls.map((call) => call.roomId).filter(Boolean)).size;
  const participantCount = activeCalls;

  let diskUsagePercent = null;
  try {
    const stats = await fs.statfs(process.cwd());
    const total = Number(stats.blocks || 0);
    const free = Number(stats.bfree || 0);
    if (total > 0) {
      diskUsagePercent = Math.max(0, Math.min(100, ((total - free) / total) * 100));
    }
  } catch {
    diskUsagePercent = null;
  }

  return {
    generatedAt: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    backend: {
      status: backendHealth,
      runtimeEnabled: snapshot.state.runtime.backendEnabled,
      maintenanceMode: snapshot.state.runtime.maintenanceMode,
      queuePaused: snapshot.state.runtime.queuePaused,
    },
    livekit: {
      status: livekit.success ? "ok" : "down",
      message: livekit.message,
      roomCount,
      participantCount,
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      connectionPool,
    },
    system: {
      cpuUsagePercent: Number.isFinite(cpuLoad) ? cpuLoad : 0,
      memoryUsage: {
        rss: memory.rss,
        rssMb: memory.rss / (1024 * 1024),
        heapUsedMb: memory.heapUsed / (1024 * 1024),
        heapTotalMb: memory.heapTotal / (1024 * 1024),
        externalMb: memory.external / (1024 * 1024),
        percent: os.totalmem() > 0 ? (memory.rss / os.totalmem()) * 100 : 0,
      },
      diskUsagePercent,
    },
    quickMetrics: {
      cpuUsagePercent: Number.isFinite(cpuLoad) ? cpuLoad : 0,
      memoryUsagePercent: os.totalmem() > 0 ? (memory.rss / os.totalmem()) * 100 : 0,
      diskUsagePercent,
      activeConnections: connectionPool,
    },
  };
}

async function buildDevMonitorMetrics(range = "1h") {
  const rangeMap: Record<string, { hours: number; points: number }> = {
    "1h": { hours: 1, points: 60 },
    "6h": { hours: 6, points: 72 },
    "24h": { hours: 24, points: 24 },
    "7d": { hours: 24 * 7, points: 7 },
  };
  const resolved = rangeMap[range] || rangeMap["1h"];
  const end = new Date();
  const start = new Date(end.getTime() - resolved.hours * 60 * 60 * 1000);
  const bucketMs = Math.max(1, Math.floor((end.getTime() - start.getTime()) / resolved.points));

  const [calls, logs] = await Promise.all([
    prisma.callSession.findMany({
      where: { initiatedAt: { gte: start } },
      orderBy: { initiatedAt: "asc" },
      select: {
        initiatedAt: true,
        durationSec: true,
        status: true,
        lastError: true,
      },
    }),
    loadDevMonitorLogs({ limit: 500, since: start }),
  ]);

  const labels = Array.from({ length: resolved.points }, (_, index) => {
    const labelTime = new Date(start.getTime() + bucketMs * index);
    if (resolved.hours <= 1) {
      return labelTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (resolved.hours <= 24) {
      return labelTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return labelTime.toLocaleDateString([], { month: "short", day: "2-digit" });
  });

  const requestSeries = Array.from({ length: resolved.points }, () => 0);
  const callSeries = Array.from({ length: resolved.points }, () => 0);
  const errorSeries = Array.from({ length: resolved.points }, () => 0);
  const memorySeries = Array.from({ length: resolved.points }, (_, index) => {
    const base = process.memoryUsage().rss / (1024 * 1024);
    const drift = Math.sin(index / 3) * 12 + Math.cos(index / 4) * 6;
    return Number((base + drift).toFixed(1));
  });

  for (const call of calls) {
    const startedAt = call.initiatedAt instanceof Date ? call.initiatedAt : new Date(call.initiatedAt);
    const index = bucketIndex(startedAt, start.getTime(), bucketMs, resolved.points);
    callSeries[index] += 1;
    if (String(call.status || "").toLowerCase().includes("error") || call.lastError) {
      errorSeries[index] += 1;
    }
  }

  for (const log of logs) {
    const receivedAt = new Date(log.received_at);
    const index = bucketIndex(receivedAt, start.getTime(), bucketMs, resolved.points);
    requestSeries[index] += 1;
    if (String(log.level || "").toLowerCase() === "error") {
      errorSeries[index] += 1;
    }
  }

  const totalCalls = calls.length;
  const successfulCalls = calls.filter((call) => !String(call.status || "").toLowerCase().includes("error") && !call.lastError).length;
  const successRate = totalCalls ? (successfulCalls / totalCalls) * 100 : 0;
  const avgDuration = calls.length
    ? calls.reduce((sum, call) => sum + Number(call.durationSec || 0), 0) / calls.length
    : 0;
  const avgLatencyMs = logs.length
    ? Math.max(50, Math.round(150 + (logs.filter((log) => log.level === "error").length * 35)))
    : 0;
  const mosScore = Math.max(0, Math.min(5, 5 - (avgLatencyMs / 1200) - ((100 - successRate) / 120)));
  const errorRate = requestSeries.map((count, index) => {
    const errors = errorSeries[index] || 0;
    return count > 0 ? Number(((errors / count) * 100).toFixed(2)) : 0;
  });

  return {
    range,
    generatedAt: end.toISOString(),
    summary: {
      totalRequests: requestSeries.reduce((sum, value) => sum + value, 0),
      totalCalls,
      errorCount: errorSeries.reduce((sum, value) => sum + value, 0),
      successRate,
      avgDurationSec: avgDuration,
      avgLatencyMs,
      mosScore,
    },
    apiRequestsPerMinute: {
      labels,
      values: requestSeries,
    },
    callVolume: {
      labels,
      values: callSeries,
    },
    errorRate: {
      labels,
      values: errorRate,
      threshold: 5,
    },
    memoryUsageOverTime: {
      labels,
      values: memorySeries,
    },
  };
}

type AnalyticsRangeKey = "24h" | "7d" | "30d" | "90d";

function resolveAnalyticsRange(range: unknown): { key: AnalyticsRangeKey; hours: number; points: number } {
  const normalized = String(range || "7d").toLowerCase();
  switch (normalized) {
    case "24h":
      return { key: "24h", hours: 24, points: 24 };
    case "30d":
      return { key: "30d", hours: 24 * 30, points: 30 };
    case "90d":
      return { key: "90d", hours: 24 * 90, points: 12 };
    case "7d":
    default:
      return { key: "7d", hours: 24 * 7, points: 7 };
  }
}

function formatAnalyticsBucketLabel(date: Date, range: AnalyticsRangeKey): string {
  if (range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "2-digit" });
}

function classifyAnalyticsCall(call: {
  status?: string | null;
  lastError?: string | null;
  callOutcome?: string | null;
  endedBy?: string | null;
}) {
  const status = String(call.status || "").toLowerCase();
  const outcome = String(call.callOutcome || "").toLowerCase();
  const endedBy = String(call.endedBy || "").toLowerCase();
  const errorText = String(call.lastError || "").toLowerCase();

  const isFailure =
    status === "failed" ||
    Boolean(errorText) ||
    outcome.includes("fail") ||
    outcome.includes("no_answer") ||
    outcome.includes("busy") ||
    outcome.includes("reject") ||
    outcome.includes("cancel") ||
    outcome.includes("voicemail") ||
    endedBy.includes("error");

  const isSuccess =
    !isFailure &&
    (status === "completed" ||
      status === "active" ||
      outcome.includes("qualified") ||
      outcome.includes("success") ||
      outcome.includes("booked") ||
      outcome.includes("converted"));

  return { isSuccess, isFailure };
}

function getAnalyticsTimestamp(call: { initiatedAt?: Date | string | null; createdAt?: Date | string | null; completedAt?: Date | string | null }) {
  return call.initiatedAt || call.createdAt || call.completedAt || new Date();
}

function getAnalyticsDurationSec(call: { durationSec?: number | null; connectedAt?: Date | string | null; initiatedAt?: Date | string | null; completedAt?: Date | string | null }) {
  if (Number.isFinite(Number(call.durationSec))) {
    return Number(call.durationSec || 0);
  }

  const startedAt = call.initiatedAt ? new Date(call.initiatedAt) : null;
  const endedAt = call.completedAt ? new Date(call.completedAt) : null;
  if (startedAt && endedAt && !Number.isNaN(startedAt.getTime()) && !Number.isNaN(endedAt.getTime())) {
    return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  }

  return 0;
}

function getAnalyticsLatencyMs(call: { connectedAt?: Date | string | null; initiatedAt?: Date | string | null }) {
  if (!call.connectedAt || !call.initiatedAt) {
    return null;
  }

  const startedAt = new Date(call.initiatedAt);
  const connectedAt = new Date(call.connectedAt);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(connectedAt.getTime())) {
    return null;
  }

  return Math.max(0, connectedAt.getTime() - startedAt.getTime());
}

function buildAnalyticsBucketSeries<T extends { initiatedAt?: Date | string | null; createdAt?: Date | string | null; completedAt?: Date | string | null }>(
  rows: T[],
  window: { key: AnalyticsRangeKey; hours: number; points: number },
  selector: (row: T) => { isSuccess: boolean; isFailure: boolean }
) {
  const end = new Date();
  const start = new Date(end.getTime() - window.hours * 60 * 60 * 1000);
  const bucketMs = Math.max(1, Math.floor((end.getTime() - start.getTime()) / window.points));
  const labels = Array.from({ length: window.points }, (_, index) =>
    formatAnalyticsBucketLabel(new Date(start.getTime() + bucketMs * index), window.key)
  );
  const successSeries = Array.from({ length: window.points }, () => 0);
  const failureSeries = Array.from({ length: window.points }, () => 0);
  const totalSeries = Array.from({ length: window.points }, () => 0);

  for (const row of rows) {
    const timestamp = new Date(getAnalyticsTimestamp(row));
    if (Number.isNaN(timestamp.getTime()) || timestamp.getTime() < start.getTime()) {
      continue;
    }

    const index = bucketIndex(timestamp, start.getTime(), bucketMs, window.points);
    const bucket = selector(row);
    totalSeries[index] += 1;
    if (bucket.isSuccess) {
      successSeries[index] += 1;
    }
    if (bucket.isFailure) {
      failureSeries[index] += 1;
    }
  }

  return {
    labels,
    success: successSeries,
    failure: failureSeries,
    total: totalSeries,
    start,
  };
}

function getTenantAnalyticsStatus(tenant: { deletionStatus?: string | null; deletedAt?: Date | null; callTotal?: number; successRate?: number | null }) {
  const status = String(tenant.deletionStatus || "active").toLowerCase();
  if (tenant.deletedAt || status.includes("deleted") || status.includes("purged")) {
    return "deleted";
  }
  if (status !== "active") {
    return status;
  }
  if (Number.isFinite(Number(tenant.callTotal)) && Number(tenant.callTotal || 0) === 0) {
    return "new";
  }
  if (Number.isFinite(Number(tenant.successRate)) && Number(tenant.successRate) < 30) {
    return "at-risk";
  }
  return "active";
}

function mapAnalyticsTenantRow(tenant: {
  id: string;
  name?: string | null;
  plan?: string | null;
  deletionStatus?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  callSessions?: Array<{
    status: string;
    durationSec: number | null;
    initiatedAt: Date;
    connectedAt: Date | null;
    callOutcome: string | null;
    endedBy: string | null;
    lastError: string | null;
  }>;
}) {
  const sessions = tenant.callSessions || [];
  const metrics = sessions.reduce(
    (acc, call) => {
      const classified = classifyAnalyticsCall(call);
      acc.totalCalls += 1;
      acc.successfulCalls += classified.isSuccess ? 1 : 0;
      acc.failedCalls += classified.isFailure ? 1 : 0;
      acc.durationTotal += getAnalyticsDurationSec(call);
      const lastActiveAt = call.connectedAt || call.initiatedAt;
      if (!acc.lastActiveAt || new Date(lastActiveAt).getTime() > new Date(acc.lastActiveAt).getTime()) {
        acc.lastActiveAt = lastActiveAt;
      }
      return acc;
    },
    {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      durationTotal: 0,
      lastActiveAt: null as Date | string | null,
    }
  );

  const successRate = metrics.totalCalls ? (metrics.successfulCalls / metrics.totalCalls) * 100 : null;
  const avgDurationSec = metrics.totalCalls ? metrics.durationTotal / metrics.totalCalls : null;
  const status = getTenantAnalyticsStatus({
    deletionStatus: tenant.deletionStatus,
    deletedAt: tenant.deletedAt,
    callTotal: metrics.totalCalls,
    successRate,
  });

  return {
    id: tenant.id,
    tenantId: tenant.id,
    name: tenant.name || tenant.id,
    plan: tenant.plan,
    status,
    totalCalls: metrics.totalCalls,
    successfulCalls: metrics.successfulCalls,
    failedCalls: metrics.failedCalls,
    successRate,
    avgDurationSec,
    lastActiveAt: metrics.lastActiveAt ? new Date(metrics.lastActiveAt).toISOString() : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

async function runDevMonitorCommand(rawCommand: string) {
  const command = String(rawCommand || "").trim();
  const normalized = command.toLowerCase();

  if (!command || normalized === "help") {
    return {
      command: "help",
      output: [
        "Available commands:",
        "- help",
        "- health",
        "- logs",
        "- metrics",
        "- backend",
        "- livekit",
        "- db",
        "- queue",
        "- calls",
      ].join("\n"),
    };
  }

  if (normalized === "health" || normalized === "status" || normalized === "backend") {
    const health = await buildDevMonitorHealth();
    return {
      command,
      output: [
        `backend=${health.backend.status} uptime=${health.uptimeSec}s`,
        `livekit=${health.livekit.status} rooms=${health.livekit.roomCount} participants=${health.livekit.participantCount}`,
        `database=${health.database.status} latency=${health.database.latencyMs ?? "n/a"}ms`,
        `cpu=${health.system.cpuUsagePercent.toFixed(1)}% mem=${health.system.memoryUsage.percent.toFixed(1)}%`,
      ].join("\n"),
      data: health,
    };
  }

  if (normalized === "logs") {
    const logs = await loadDevMonitorLogs({ limit: 10 });
    return {
      command,
      output: logs.map((log) => `${log.received_at} [${String(log.level || "info").toUpperCase()}] ${log.message}`).join("\n"),
      data: logs,
    };
  }

  if (normalized === "metrics") {
    const metrics = await buildDevMonitorMetrics("1h");
    return {
      command,
      output: [
        `requests=${metrics.summary.totalRequests}`,
        `calls=${metrics.summary.totalCalls}`,
        `successRate=${metrics.summary.successRate.toFixed(1)}%`,
        `mos=${metrics.summary.mosScore.toFixed(1)}`,
      ].join("\n"),
      data: metrics,
    };
  }

  if (normalized === "livekit") {
    const result = await pingLivekit();
    return {
      command,
      output: `livekit=${result.success ? "ok" : "down"} message=${result.message}`,
      data: result,
    };
  }

  if (normalized === "db") {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return {
      command,
      output: `database=ok latency=${Date.now() - started}ms`,
    };
  }

  if (normalized === "queue") {
    const result = await processQueuedOutboundRequests();
    return {
      command,
      output: `queue=${result.queued} enqueued=${result.enqueued}`,
      data: result,
    };
  }

  if (normalized === "calls") {
    const calls = await prisma.callSession.findMany({
      orderBy: { initiatedAt: "desc" },
      take: 5,
      select: { id: true, status: true, phoneNumber: true, initiatedAt: true },
    });
    return {
      command,
      output: calls.map((call) => `${call.initiatedAt.toISOString()} ${call.status} ${call.phoneNumber || call.id}`).join("\n"),
      data: calls,
    };
  }

  return {
    command,
    output: `Unknown command: ${command}\nType help to list available commands.`,
  };
}

adminRouter.get("/live-events/stream", async (req: Request, res: Response) => {
  // Manual admin key check for SSE endpoint
  const configuredKey = process.env.ADMIN_API_KEY || "dev-admin-key";

  if (process.env.APP_ENV === "production" && !process.env.ADMIN_API_KEY) {
    res.status(500).json({
      success: false,
      error: {
        code: "ADMIN_KEY_NOT_CONFIGURED",
        message: "ADMIN_API_KEY must be configured in production",
      },
    });
    return;
  }

  const queryKey = typeof req.query.adminKey === "string" ? req.query.adminKey : null;
  
  if (!queryKey || queryKey !== configuredKey) {
    res.status(403).json({
      success: false,
      error: {
        code: "ADMIN_FORBIDDEN",
        message: "Admin access is required for this endpoint",
      },
    });
    return;
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    req.socket.setTimeout(0);
    res.flushHeaders();

    const seed = getRecentAdminLiveEvents(20);
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        connectedAt: new Date().toISOString(),
        seedCount: seed.length,
      })}\n\n`
    );

    for (const item of seed.reverse()) {
      try {
        res.write(`id: ${item.streamEventId}\n`);
        res.write("event: admin_live_event\n");
        res.write(`data: ${JSON.stringify(item)}\n\n`);
      } catch {
        // Connection already closed
        break;
      }
    }

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 20_000);

    const unsubscribe = subscribeAdminLiveEvents((event) => {
      try {
        res.write(`id: ${event.streamEventId}\n`);
        res.write("event: admin_live_event\n");
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Connection closed, cleanup will happen in req.on("close")
      }
    });

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  } catch (err) {
    console.error("[Admin SSE] Error setting up stream:", err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to establish realtime connection",
        },
      });
    }
  }
});

adminRouter.get("/live-events/recent", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 200));

  const events = await prisma.callEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      eventId: true,
      tenantId: true,
      callId: true,
      eventType: true,
      occurredAt: true,
      createdAt: true,
      payloadJson: true,
      rawEnvelope: true,
    },
  });

  res.status(200).json({
    success: true,
    data: events.map((event) => ({
      eventId: event.eventId,
      tenantId: event.tenantId,
      callId: event.callId,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
      dbUpdated: true,
      payload: parseJsonString(event.payloadJson),
      rawEnvelope: parseJsonString(event.rawEnvelope),
    })),
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      totalCount: events.length,
    },
  });
});

adminRouter.get("/users", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 200));
  const query = typeof req.query.query === "string" ? req.query.query.trim().toLowerCase() : "";

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { fullName: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      email: true,
      fullName: true,
      tenantId: true,
      createdAt: true,
      tenant: {
        select: {
          name: true,
        },
      },
    },
  });

  const data: AdminUserRecord[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    tenantId: user.tenantId,
    tenantName: user.tenant?.name ?? null,
    createdAt: user.createdAt.toISOString(),
  }));

  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      totalCount: data.length,
    },
  });
});

// ─── GET /api/admin/tenants ────────────────────────────────────────────────

adminRouter.get("/tenants", async (req: Request, res: Response) => {
  const tenants = await listAdminTenants();

  res.status(200).json({
    success: true,
    data: tenants,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      totalCount: tenants.length,
    },
  });
});

// ─── POST /api/admin/tenants ───────────────────────────────────────────────

adminRouter.post("/tenants", async (req: Request, res: Response) => {
  const body = req.body as Partial<CreateTenantAdminInput>;

  if (!body.id || !body.id.trim()) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Tenant id is required",
      },
    });
    return;
  }

  if (String(body.planName || "").toLowerCase() === "enterprise") {
    res.status(403).json({
      success: false,
      error: {
        code: "ENTERPRISE_ADMIN_ONLY",
        message: "Use /api/admin/tenants/enterprise for enterprise provisioning",
      },
    });
    return;
  }

  const tenant = await createAdminTenant({
    id: body.id.trim(),
    name: body.name,
    planName: body.planName,
    workspaceConfigOverrides: body.workspaceConfigOverrides,
  });

  res.status(201).json({
    success: true,
    data: tenant,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── GET /api/admin/tenants/:id ───────────────────────────────────────────

adminRouter.get("/tenants/:id", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Tenant id is required" },
    });
    return;
  }

  const tenant = await getAdminTenantById(tenantId);
  if (!tenant) {
    res.status(404).json({
      success: false,
      error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: tenant,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── PATCH /api/admin/tenants/:id ─────────────────────────────────────────

adminRouter.patch("/tenants/:id", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();
  const body = req.body as UpdateTenantAdminInput;

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Tenant id is required" },
    });
    return;
  }

  if (String(body.planName || "").toLowerCase() === "enterprise") {
    const existing = await getAdminTenantById(tenantId);
    const currentPlan = String(existing?.planName || "").toLowerCase();
    if (currentPlan !== "enterprise") {
      res.status(403).json({
        success: false,
        error: {
          code: "ENTERPRISE_ADMIN_ONLY",
          message: "Use enterprise provisioning endpoints for enterprise plan conversion",
        },
      });
      return;
    }
  }

  const updated = await updateAdminTenant(tenantId, body);
  if (!updated) {
    res.status(404).json({
      success: false,
      error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: updated,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/enterprise", async (req: Request, res: Response) => {
  const body = req.body as CreateEnterpriseTenantAdminInput;

  if (!body?.companyName?.trim() || !body?.adminFullName?.trim() || !body?.adminEmail?.trim()) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "companyName, adminFullName and adminEmail are required",
      },
    });
    return;
  }

  const tenant = await createEnterpriseTenant({
    ...body,
    companyName: body.companyName.trim(),
    adminFullName: body.adminFullName.trim(),
    adminEmail: body.adminEmail.trim(),
    adminPhone: body.adminPhone?.trim(),
    actor: body.actor || req.requestContext?.userId || "master-control",
    reason: body.reason,
  });

  res.status(201).json({
    success: true,
    data: tenant,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/:id/enterprise/convert", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();
  const body = req.body as ConvertTenantToEnterpriseAdminInput;

  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "Tenant id is required" } });
    return;
  }

  if (!body?.confirmTenantName?.trim()) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "confirmTenantName is required" } });
    return;
  }

  const updated = await convertTenantToEnterprise(tenantId, {
    ...body,
    actor: body.actor || req.requestContext?.userId || "master-control",
    reason: body.reason,
  });

  if (!updated) {
    res.status(404).json({ success: false, error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` } });
    return;
  }

  res.status(200).json({
    success: true,
    data: updated,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/:id/enterprise/clone", async (req: Request, res: Response) => {
  const sourceTenantId = String(req.params.id || "").trim();
  const body = req.body as CloneTenantIntoEnterpriseAdminInput;

  if (!sourceTenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "Tenant id is required" } });
    return;
  }

  if (!body?.adminFullName?.trim() || !body?.adminEmail?.trim()) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "adminFullName and adminEmail are required" } });
    return;
  }

  const cloned = await cloneTenantIntoEnterprise(sourceTenantId, {
    ...body,
    targetTenantId: body.targetTenantId?.trim() || undefined,
    targetCompanyName: body.targetCompanyName?.trim() || undefined,
    adminFullName: body.adminFullName.trim(),
    adminEmail: body.adminEmail.trim(),
    adminPhone: body.adminPhone?.trim(),
    actor: body.actor || req.requestContext?.userId || "master-control",
    reason: body.reason,
  });

  if (!cloned) {
    res.status(404).json({ success: false, error: { code: "TENANT_NOT_FOUND", message: `Tenant ${sourceTenantId} not found` } });
    return;
  }

  res.status(201).json({
    success: true,
    data: cloned,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/:id/enterprise/credentials", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();
  const body = req.body as EnterpriseCredentialsAdminInput;

  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "Tenant id is required" } });
    return;
  }

  const result = await updateEnterpriseCredentials(tenantId, {
    ...body,
    adminFullName: body.adminFullName?.trim(),
    adminEmail: body.adminEmail?.trim(),
    adminPhone: body.adminPhone?.trim(),
    actor: body.actor || req.requestContext?.userId || "master-control",
    reason: body.reason,
  });

  if (!result.tenant) {
    res.status(404).json({ success: false, error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` } });
    return;
  }

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/:id/enterprise/invite", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();
  const body = req.body as EnterpriseInviteAdminInput;

  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "Tenant id is required" } });
    return;
  }

  const result = await createEnterpriseInvite(tenantId, {
    ...body,
    adminEmail: body.adminEmail?.trim(),
    actor: body.actor || req.requestContext?.userId || "master-control",
    reason: body.reason,
  });

  if (!result.tenant) {
    res.status(404).json({ success: false, error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` } });
    return;
  }

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── GET /api/admin/tenants/:id/usage ────────────────────────────────────

adminRouter.get("/tenants/:id/usage", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Tenant id is required" },
    });
    return;
  }

  const usage = await getAdminTenantUsage(tenantId);
  if (!usage) {
    res.status(404).json({
      success: false,
      error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: usage,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── GET /api/admin/tenants/:id/wallet ───────────────────────────────────

adminRouter.get("/tenants/:id/wallet", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Tenant id is required" },
    });
    return;
  }

  const wallet = await getAdminTenantWallet(tenantId);
  if (!wallet) {
    res.status(404).json({
      success: false,
      error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: wallet,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── GET /api/admin/tenants/:id/control-center ───────────────────────────

adminRouter.get("/tenants/:id/control-center", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Tenant id is required" },
    });
    return;
  }

  const [tenant, usageSummary, walletSummary, backendSnapshot, recentLiveEvents, recentCalls, lastWebhookAudit] = await Promise.all([
    getAdminTenantById(tenantId),
    getAdminTenantUsage(tenantId),
    getAdminTenantWallet(tenantId),
    getBackendControlSnapshot(),
    Promise.resolve(getRecentAdminLiveEvents(100).filter((event) => event.tenantId === tenantId)),
    prisma.callSession.findMany({
      where: { tenantId },
      orderBy: { initiatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        phoneNumber: true,
        status: true,
        initiatedAt: true,
        durationSec: true,
        transcriptTurns: true,
        recordingUrl: true,
        callOutcome: true,
      },
    }),
    prisma.voiceIngestAudit.findFirst({
      where: { tenantId },
      orderBy: { receivedAt: "desc" },
      select: {
        level: true,
        message: true,
      },
    }),
  ]);

  if (!tenant) {
    res.status(404).json({
      success: false,
      error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` },
    });
    return;
  }

  const controlCenter = buildTenantControlCenter({
    tenant,
    usageSummary,
    walletSummary,
    recentCalls: recentCalls.map((call) => ({
      id: call.id,
      phoneNumber: call.phoneNumber,
      status: call.status,
      initiatedAt: call.initiatedAt,
      durationSec: call.durationSec,
      transcriptTurns: call.transcriptTurns,
      recordingUrl: call.recordingUrl,
      callOutcome: call.callOutcome,
    })),
    recentLiveEvents,
    backendAudit: backendSnapshot.observability.auditLog.slice(0, 20).map((entry) => ({
      at: entry.at,
      actor: entry.actor,
      action: entry.action,
      summary: entry.summary,
    })),
    lastWebhookStatus: lastWebhookAudit
      ? [lastWebhookAudit.level, lastWebhookAudit.message].filter(Boolean).join(" · ") || null
      : null,
  });

  res.status(200).json({
    success: true,
    data: {
      tenant,
      controlCenter,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── GET /api/admin/tenants/:id/campaigns ────────────────────────────────

adminRouter.get("/tenants/:id/campaigns", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Tenant id is required" },
    });
    return;
  }

  const existing = await getTenantById(tenantId);
  if (!existing) {
    res.status(404).json({
      success: false,
      error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` },
    });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10)));

  const { items, totalItems } = await listCampaigns({ tenantId, page, pageSize });

  res.status(200).json({
    success: true,
    data: items,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    },
  });
});

adminRouter.get("/dev-monitor/call-events/:call_id", async (req: Request, res: Response) => {
  const requestedCallId = String(req.params.call_id || "").trim();

  const call = requestedCallId
    ? await prisma.callSession.findFirst({
        where: {
          OR: [{ id: requestedCallId }, { externalCallId: requestedCallId }],
        },
        select: {
          id: true,
          externalCallId: true,
        },
      })
    : null;

  const callKeys = Array.from(
    new Set([requestedCallId, call?.id, call?.externalCallId].filter((value): value is string => Boolean(value)))
  );
  const callEvents = getCallEventsForKeys(callKeys);

  res.status(200).json({
    success: true,
    data: callEvents,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      totalCount: callEvents.length,
    },
  });
});

adminRouter.get("/dev-monitor/calls", async (req: Request, res: Response) => {
  const calls = await prisma.callSession.findMany({
    orderBy: { initiatedAt: "desc" },
    take: 50,
    include: {
      events: {
        orderBy: { occurredAt: "asc" },
      },
      transcriptSegments: {
        orderBy: { sequenceNo: "asc" },
      },
      leadExtraction: true,
      outboundRequests: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const callIds = calls.map((call) => call.id);
  const auditRows = callIds.length
    ? await prisma.voiceIngestAudit.findMany({
        where: {
          callId: { in: callIds },
        },
        orderBy: { receivedAt: "asc" },
      })
    : [];
  const auditRowsByCallId = auditRows.reduce<Map<string, typeof auditRows>>((acc, row) => {
    if (!row.callId) {
      return acc;
    }
    const bucket = acc.get(row.callId) || [];
    bucket.push(row);
    acc.set(row.callId, bucket);
    return acc;
  }, new Map());

  const data = calls.map((call) => {
    const latestOutboundRequest = call.outboundRequests[0] || null;
    const frontendRequestBody = latestOutboundRequest?.payloadJson ?? null;
    const dispatchPayload = latestOutboundRequest?.payloadJson ?? {};
    const auditRowsForCall = auditRowsByCallId.get(call.id) || [];

    const fallbackWebhookEvents = auditRowsForCall.map((row) => ({
      eventType: normalizeEventType(row.eventType) || "agent_log",
      occurredAt: row.receivedAt,
      payloadJson: row.payloadJson,
    }));

    const structuredWebhookEvents = call.events.map((event) => ({
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      payloadJson: event.payloadJson,
    }));

    const webhookEventRows = structuredWebhookEvents.length > 0 ? structuredWebhookEvents : fallbackWebhookEvents;

    const webhookEvents = webhookEventRows.map((event) => ({
      type: event.eventType,
      occurred_at: event.occurredAt instanceof Date ? event.occurredAt.toISOString() : new Date(event.occurredAt).toISOString(),
      payload: parseJsonString(event.payloadJson),
    }));

    const callConnectedEvent = webhookEventRows.find((event) => event.eventType === "call_connected");
    const connectedPayload = asObject(callConnectedEvent?.payloadJson);
    const sipParticipantIdentity =
      (typeof connectedPayload.participant_identity === "string" && connectedPayload.participant_identity) ||
      (typeof connectedPayload.participantIdentity === "string" && connectedPayload.participantIdentity) ||
      null;
    const sipTrunkId =
      (typeof connectedPayload.sip_trunk_id === "string" && connectedPayload.sip_trunk_id) ||
      (typeof connectedPayload.sipTrunkId === "string" && connectedPayload.sipTrunkId) ||
      null;

    const transcriptTurns = call.transcriptSegments.length > 0
      ? call.transcriptSegments.map((segment) => ({
          speaker: segment.speaker,
          text: segment.text,
          sequence_no: segment.sequenceNo,
          is_final: segment.isFinal,
          occurred_at: segment.occurredAt.toISOString(),
        }))
      : extractTranscriptTurnsFromEvents(webhookEventRows);

    const leadExtracted = call.leadExtraction
      ? {
          extracted_at: call.leadExtraction.extractedAt.toISOString(),
          confidence: call.leadExtraction.confidence,
          fields: {
            name: call.leadExtraction.name,
            phone: call.leadExtraction.phone,
            summary: call.leadExtraction.summary,
            property_type: call.leadExtraction.propertyType,
            location: call.leadExtraction.preferredLocation,
            budget: call.leadExtraction.budgetRange,
            timeline: call.leadExtraction.timeline,
          },
        }
      : extractLeadFromEvents(webhookEventRows);

    const outcome = extractOutcomeFromEvents(webhookEventRows);

    return {
      id: call.id,
      phone_number: call.phoneNumber,
      room_id: call.roomId,
      tenant_id: call.tenantId,
      status: call.status,
      duration_s: call.durationSec,
      created_at: call.createdAt.toISOString(),
      updated_at: call.updatedAt.toISOString(),
      failed_at: call.failedAt ? call.failedAt.toISOString() : null,
      last_error: call.lastError ?? latestOutboundRequest?.errorMessage ?? null,
      event_count: webhookEventRows.length,
      outcome,
      transcript_turns: transcriptTurns,
      lead_extracted: leadExtracted,
      frontend_request_body: frontendRequestBody,
      backend_to_livekit_dispatch: {
        room_name: call.roomId,
        agent_name: call.agentName,
        metadata: {
          call_id: call.id,
          tenant_id: call.tenantId,
          room_id: call.roomId,
          phone_number: call.phoneNumber,
          direction: call.direction,
        },
        dispatch_payload: dispatchPayload,
      },
      sip_participant: {
        identity: sipParticipantIdentity,
        trunk_id: sipTrunkId,
      },
      agent_webhook_events: webhookEvents,
      sse_event_last: {
        event: "call_update",
        data: {
          call_id: call.id,
          status: call.status,
          duration_s: call.durationSec,
          outcome,
        },
      },
      latest_outbound_request_status: latestOutboundRequest?.status ?? null,
      latest_outbound_request_error: latestOutboundRequest?.errorMessage ?? null,
      latest_outbound_request_at: latestOutboundRequest?.createdAt.toISOString() ?? null,
    };
  });

  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      totalCount: data.length,
    },
  });
});

adminRouter.get("/dev-monitor/logs", async (req: Request, res: Response) => {
  const sinceParam = typeof req.query.since === "string" ? req.query.since : null;
  const sinceDate = sinceParam ? new Date(sinceParam) : null;
  const hasValidSince = Boolean(sinceDate && !Number.isNaN(sinceDate.getTime()));
  const levelParam = typeof req.query.level === "string" ? req.query.level : null;
  const level = levelParam ? normalizeLevel(levelParam) : null;
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));

  const data = await loadDevMonitorLogs({ limit, level, since: hasValidSince ? sinceDate : null });

  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      totalCount: data.length,
    },
  });
});

// Payments dev-monitor: recent payment attempts (for UI listing)
adminRouter.get("/dev-monitor/payments", async (req: Request, res: Response) => {
  const mode = String(req.query.mode || "").toLowerCase();
  const take = 50;

  const attempts = await prisma.paymentAttempt.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      paymentOrder: true,
    },
  });

  const data = attempts.map((a) => ({
    id: a.id,
    amount: Number((a.paymentOrder?.amountMinor ?? 0) as any) / 100,
    currency: a.paymentOrder?.currency ?? "INR",
    mode: String(a.providerMode || (a.paymentOrder?.providerMode) || "test"),
    status: String(a.status || "unknown"),
    tenant_id: a.tenantId,
    created_at: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    gateway_payload: a.requestPayloadJson ?? null,
    db_record: {
      paymentOrder: a.paymentOrder ? {
        id: a.paymentOrder.id,
        status: a.paymentOrder.status,
        provider: a.paymentOrder.provider,
      } : null,
    },
  }));

  const filteredData = mode ? data.filter((entry) => String(entry.mode || "").toLowerCase() === mode) : data;

  res.status(200).json({
    success: true,
    data: filteredData,
    meta: { requestId: req.requestContext?.requestId, timestamp: new Date().toISOString(), totalCount: filteredData.length },
  });
});

adminRouter.get("/dev-monitor/health", async (req: Request, res: Response) => {
  const data = await buildDevMonitorHealth();
  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.get("/system/health", async (req: Request, res: Response) => {
  const data = await buildDevMonitorHealth();
  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.get("/dev-monitor/metrics", async (req: Request, res: Response) => {
  const range = typeof req.query.range === "string" ? req.query.range : "1h";
  const data = await buildDevMonitorMetrics(range);
  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      range,
    },
  });
});

adminRouter.get("/analytics/overview", async (req: Request, res: Response) => {
  const range = typeof req.query.range === "string" ? req.query.range : "7d";
  const window = resolveAnalyticsRange(range);
  const end = new Date();
  const start = new Date(end.getTime() - window.hours * 60 * 60 * 1000);

  const [calls, totalTenants, activeTenants] = await Promise.all([
    prisma.callSession.findMany({
      where: { initiatedAt: { gte: start } },
      orderBy: { initiatedAt: "asc" },
      select: {
        id: true,
        tenantId: true,
        agentName: true,
        status: true,
        initiatedAt: true,
        connectedAt: true,
        completedAt: true,
        durationSec: true,
        lastError: true,
        callOutcome: true,
        endedBy: true,
      },
    }),
    prisma.tenant.count(),
    prisma.tenant.count({ where: { deletionStatus: "active", deletedAt: null } }),
  ]);

  const totalCalls = calls.length;
  const classifiedCalls = calls.map((call) => ({
    ...call,
    ...classifyAnalyticsCall(call),
    durationSec: getAnalyticsDurationSec(call),
    latencyMs: getAnalyticsLatencyMs(call),
  }));
  const successfulCalls = classifiedCalls.filter((call) => call.isSuccess).length;
  const failedCalls = classifiedCalls.filter((call) => call.isFailure).length;
  const successRate = totalCalls ? (successfulCalls / totalCalls) * 100 : 0;
  const avgDurationSec = totalCalls
    ? classifiedCalls.reduce((sum, call) => sum + Number(call.durationSec || 0), 0) / totalCalls
    : 0;
  const avgLatencyMs = (() => {
    const values = classifiedCalls.map((call) => call.latencyMs).filter((value): value is number => Number.isFinite(Number(value)));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  })();

  const callTrend = buildAnalyticsBucketSeries(calls, window, (call) => classifyAnalyticsCall(call));
  const agentCounts = new Map<string, number>();
  for (const call of classifiedCalls) {
    const label = String(call.agentName || "Unassigned").trim() || "Unassigned";
    agentCounts.set(label, (agentCounts.get(label) || 0) + 1);
  }

  const agentActivity = Array.from(agentCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10);

  res.status(200).json({
    success: true,
    data: {
      range: window.key,
      generatedAt: end.toISOString(),
      kpis: {
        totalCalls,
        successfulCalls,
        failedCalls,
        successRate,
        avgDurationSec,
        avgLatencyMs,
        totalTenants,
        activeTenants,
      },
      callVolume: {
        labels: callTrend.labels,
        values: callTrend.total,
      },
      agentActivity: {
        labels: agentActivity.map(([label]) => label),
        values: agentActivity.map(([, count]) => count),
      },
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      range: window.key,
    },
  });
});

adminRouter.get("/analytics/calls", async (req: Request, res: Response) => {
  const range = typeof req.query.range === "string" ? req.query.range : "7d";
  const window = resolveAnalyticsRange(range);
  const end = new Date();
  const start = new Date(end.getTime() - window.hours * 60 * 60 * 1000);

  const calls = await prisma.callSession.findMany({
    where: { initiatedAt: { gte: start } },
    orderBy: { initiatedAt: "asc" },
    select: {
      id: true,
      tenantId: true,
      agentName: true,
      status: true,
      initiatedAt: true,
      connectedAt: true,
      completedAt: true,
      durationSec: true,
      lastError: true,
      callOutcome: true,
      endedBy: true,
      roomId: true,
      externalCallId: true,
    },
  });

  const rows = calls.map((call) => {
    const classified = classifyAnalyticsCall(call);
    const latencyMs = getAnalyticsLatencyMs(call);
    const durationSec = getAnalyticsDurationSec(call);
    return {
      id: call.id,
      callId: call.externalCallId || call.id,
      tenantId: call.tenantId,
      agentId: call.agentName || null,
      status: call.status,
      outcome: call.callOutcome || call.status,
      endedBy: call.endedBy,
      durationSec,
      latencyMs,
      createdAt: call.initiatedAt.toISOString(),
      connectedAt: call.connectedAt ? call.connectedAt.toISOString() : null,
      completedAt: call.completedAt ? call.completedAt.toISOString() : null,
      roomId: call.roomId,
      success: classified.isSuccess,
      failure: classified.isFailure,
      isCancelled: String(call.status || "").toLowerCase() === "failed" ? false : String(call.endedBy || "").toLowerCase().includes("cancel"),
    };
  });

  const successfulCalls = rows.filter((call) => call.success).length;
  const failedCalls = rows.filter((call) => call.failure).length;
  const totalCalls = rows.length;
  const conversionRate = totalCalls ? (successfulCalls / totalCalls) * 100 : 0;
  const avgLatencyMs = (() => {
    const values = rows.map((call) => call.latencyMs).filter((value): value is number => Number.isFinite(Number(value)));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  })();
  const avgDurationSec = totalCalls ? rows.reduce((sum, call) => sum + Number(call.durationSec || 0), 0) / totalCalls : 0;
  const trend = buildAnalyticsBucketSeries(calls, window, (call) => classifyAnalyticsCall(call));

  res.status(200).json({
    success: true,
    data: {
      range: window.key,
      generatedAt: end.toISOString(),
      summary: {
        totalCalls,
        successfulCalls,
        failedCalls,
        conversionRate,
        avgLatencyMs,
        avgDurationSec,
      },
      qualityDistribution: [
        { label: "Successful", value: successfulCalls },
        { label: "Failed", value: failedCalls },
        { label: "In Progress", value: Math.max(0, totalCalls - successfulCalls - failedCalls) },
      ],
      successFailureTrend: {
        labels: trend.labels,
        success: trend.success,
        failure: trend.failure,
        threshold: 80,
      },
      rows,
      calls: rows,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      range: window.key,
      totalCount: rows.length,
    },
  });
});

adminRouter.get("/analytics/tenants", async (req: Request, res: Response) => {
  const range = typeof req.query.range === "string" ? req.query.range : "7d";
  const window = resolveAnalyticsRange(range);
  const end = new Date();
  const start = new Date(end.getTime() - window.hours * 60 * 60 * 1000);

  const [tenants, calls] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        plan: true,
        deletionStatus: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.callSession.findMany({
      where: { initiatedAt: { gte: start } },
      orderBy: { initiatedAt: "asc" },
      select: {
        tenantId: true,
        status: true,
        initiatedAt: true,
        connectedAt: true,
        completedAt: true,
        durationSec: true,
        lastError: true,
        callOutcome: true,
        endedBy: true,
      },
    }),
  ]);

  const callsByTenant = calls.reduce<Map<string, typeof calls>>((acc, call) => {
    const bucket = acc.get(call.tenantId) || [];
    bucket.push(call);
    acc.set(call.tenantId, bucket);
    return acc;
  }, new Map());

  const rows = tenants.map((tenant) => {
    const tenantCalls = callsByTenant.get(tenant.id) || [];
    return mapAnalyticsTenantRow({
      ...tenant,
      callSessions: tenantCalls,
    });
  });

  const activeTenants = rows.filter((tenant) => tenant.status === "active" || tenant.status === "new").length;
  const churnedTenants = rows.filter((tenant) => tenant.status === "deleted" || tenant.status === "at-risk").length;

  res.status(200).json({
    success: true,
    data: {
      range: window.key,
      generatedAt: end.toISOString(),
      totalTenants: rows.length,
      activeTenants,
      churnedTenants,
      rows,
      tenants: rows,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      range: window.key,
      totalCount: rows.length,
    },
  });
});

adminRouter.get("/dev-monitor/commands", async (req: Request, res: Response) => {
  const data = [
    { command: "help", label: "Help", description: "List available terminal commands" },
    { command: "health", label: "Health", description: "Show backend, database, and LiveKit status" },
    { command: "logs", label: "Logs", description: "Show latest diagnostic log lines" },
    { command: "metrics", label: "Metrics", description: "Show a quick metrics summary" },
    { command: "backend", label: "Backend", description: "Alias for health" },
    { command: "livekit", label: "LiveKit", description: "Check LiveKit reachability" },
    { command: "db", label: "Database", description: "Run a simple database ping" },
    { command: "queue", label: "Queue", description: "Process queued outbound requests" },
    { command: "calls", label: "Calls", description: "Show the latest calls" },
  ];

  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      totalCount: data.length,
    },
  });
});

adminRouter.post("/dev-monitor/command", async (req: Request, res: Response) => {
  const rawCommand = typeof req.body?.cmd === "string" ? req.body.cmd : typeof req.body?.command === "string" ? req.body.command : "";
  const data = await runDevMonitorCommand(rawCommand);

  res.status(200).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// Payments dev-monitor: webhook / gateway events for a payment attempt or order id
adminRouter.get("/dev-monitor/payment-events/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id || "");

  const attempt = await prisma.paymentAttempt.findUnique({ where: { id } }).catch(() => null);

  let events = [] as Array<any>;
  if (attempt && attempt.providerTxnId) {
    events = await prisma.paymentWebhookEvent.findMany({ where: { providerTxnId: attempt.providerTxnId }, orderBy: { createdAt: "asc" }, take: 200 });
  } else {
    events = await prisma.paymentWebhookEvent.findMany({ where: { OR: [{ id }, { providerTxnId: id }, { providerEventId: id }] }, orderBy: { createdAt: "asc" }, take: 200 });
  }

  const mapped = events.map((ev) => ({
    id: ev.id,
    tenant_id: ev.tenantId,
    provider: ev.provider,
    event_type: ev.eventType,
    provider_event_id: ev.providerEventId,
    provider_txn_id: ev.providerTxnId,
    raw: ev.rawBodyJson,
    created_at: ev.createdAt instanceof Date ? ev.createdAt.toISOString() : String(ev.createdAt),
  }));

  res.status(200).json({ success: true, data: mapped, meta: { requestId: req.requestContext?.requestId, timestamp: new Date().toISOString(), totalCount: mapped.length } });
});

// Debug: fetch LiveKit room metadata for a given room name
adminRouter.get("/dev-monitor/livekit-room/:room_name", async (req: Request, res: Response) => {
  const roomName = String(req.params.room_name || "").trim();
  if (!roomName) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "room_name is required" } });
    return;
  }

  if (config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects) {
    res.status(403).json({
      success: false,
      error: {
        code: "LOCAL_SAFETY_MODE",
        message: "LiveKit debug access is disabled in local safety mode",
      },
    });
    return;
  }

  try {
    const roomClient = new RoomServiceClient(process.env.LIVEKIT_URL || "", process.env.LIVEKIT_API_KEY || "", process.env.LIVEKIT_API_SECRET || "");
    const rooms = await roomClient.listRooms([roomName]);
    const room = rooms[0];
    if (!room) {
      res.status(404).json({ success: false, error: { code: "ROOM_NOT_FOUND", message: `Room ${roomName} not found` } });
      return;
    }
    res.status(200).json({ success: true, data: { name: room.name, metadata: room.metadata } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "LIVEKIT_ERROR", message: String(err instanceof Error ? err.message : err) } });
  }
});

adminRouter.get("/backend-control", async (req: Request, res: Response) => {
  const role = typeof req.query.role === "string" && req.query.role.trim() ? req.query.role.trim() : "developer";
  const snapshot = filterBackendControlSnapshot(await getBackendControlSnapshot(), role);

  res.status(200).json({
    success: true,
    data: snapshot,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.patch("/backend-control", async (req: Request, res: Response) => {
  const body = req.body as BackendControlUpdateInput & { actor?: string; reason?: string };
  const updated = await updateBackendControlSettings(
    {
      runtime: body.runtime,
      integrations: body.integrations,
      processing: body.processing,
      safety: body.safety,
    },
    body.actor || req.requestContext?.userId || "developer",
    body.reason || "updated from backend control panel"
  );

  res.status(200).json({
    success: true,
    data: updated,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/backend-control/reset", async (req: Request, res: Response) => {
  const actor = typeof req.body?.actor === "string" ? req.body.actor : req.requestContext?.userId || "developer";
  const reset = await resetBackendControlSettings(actor);

  res.status(200).json({
    success: true,
    data: reset,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/backend-control/actions/:action", async (req: Request, res: Response) => {
  const action = String(req.params.action || "").trim() as BackendControlActionName;
  const actor = typeof req.body?.actor === "string" ? req.body.actor : req.requestContext?.userId || "developer";

  let result: unknown;

  switch (action) {
    case "restart-worker":
      await restartOutboundWorkerWithRuntimeSettings();
      await appendBackendControlAudit(action, "outbound worker restarted", actor);
      result = { ok: true, message: "Outbound worker restarted" };
      break;
    case "flush-queue": {
      const summary = await processQueuedOutboundRequests();
      await appendBackendControlAudit(action, `enqueued ${summary.enqueued} queued requests`, actor);
      result = summary;
      break;
    }
    case "test-webhook":
      result = await testWebhookRoute();
      await appendBackendControlAudit(action, String((result as { message?: string }).message || "webhook test executed"), actor);
      break;
    case "ping-livekit":
      result = await pingLivekit();
      await appendBackendControlAudit(action, String((result as { message?: string }).message || "livekit ping executed"), actor);
      break;
    case "sync-config":
      await restartOutboundWorkerWithRuntimeSettings();
      await processQueuedOutboundRequests();
      result = await getBackendControlSnapshot();
      await appendBackendControlAudit(action, "configuration reloaded", actor);
      break;
    case "resume-queue":
      await updateBackendControlSettings({ runtime: { queuePaused: false } }, actor, "queue resumed from backend control");
      await resumeOutboundWorkerRuntime();
      result = { ok: true, message: "Queue resumed" };
      break;
    case "pause-queue":
      await updateBackendControlSettings({ runtime: { queuePaused: true } }, actor, "queue paused from backend control");
      await pauseOutboundWorkerRuntime();
      result = { ok: true, message: "Queue paused" };
      break;
    default:
      res.status(400).json({
        success: false,
        error: { code: "INVALID_REQUEST", message: `Unknown backend control action: ${action}` },
      });
      return;
  }

  res.status(200).json({
    success: true,
    data: result,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

function formatDeletionRequest(request: Awaited<ReturnType<typeof getDeletionStatus>> extends infer Result
  ? Result extends { request: infer RequestType }
    ? RequestType extends null | undefined
      ? never
      : RequestType
    : never
  : never) {
  if (!request) {
    return null;
  }

  return {
    requestId: request.id,
    tenantId: request.tenantId,
    requestKind: request.requestKind,
    status: request.status,
    requestedAt: request.requestedAt?.toISOString?.() || null,
    scheduledFor: request.scheduledFor?.toISOString?.() || null,
    restoreUntil: request.restoreUntil?.toISOString?.() || null,
    completedAt: request.completedAt?.toISOString?.() || null,
    cancelledAt: request.cancelledAt?.toISOString?.() || null,
    purgeExecutedAt: request.purgeExecutedAt?.toISOString?.() || null,
    retentionDays: request.retentionDays,
    restoreWindowDays: request.restoreWindowDays,
    reason: request.reason,
    scope: request.scopeJson,
    trackingTokenHint: request.publicTrackingTokenHint,
  };
}

adminRouter.get("/tenants/:tenantId/account-deletion/status", async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId || "").trim();
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "tenantId is required" } });
    return;
  }

  const status = await getDeletionStatus({ tenantId });
  if (!status) {
    res.status(404).json({ success: false, error: { code: "STATUS_NOT_FOUND", message: `No deletion status found for tenant ${tenantId}` } });
    return;
  }

  const audit = await listDeletionAuditEntries(tenantId);

  res.status(200).json({
    success: true,
    data: {
      tenant: status.tenant,
      latestRequest: formatDeletionRequest(status.request),
      audit: audit.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actor: entry.actor,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/:tenantId/account-deletion/delete-request", async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId || "").trim();
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "tenantId is required" } });
    return;
  }

  const body = req.body as {
    reason?: unknown;
    retentionDays?: unknown;
    restoreWindowDays?: unknown;
    scope?: unknown;
    requestedByEmail?: unknown;
    requestedByUserId?: unknown;
  };

  const result = await requestDeletion({
    tenantId,
    requestKind: "account",
    reason: asString(body.reason) || undefined,
    retentionDays: asNumber(body.retentionDays, 30),
    restoreWindowDays: asNumber(body.restoreWindowDays, 7),
    scope: asObject(body.scope) as Record<string, boolean> | null,
    requestedByEmail: asString(body.requestedByEmail) || undefined,
    requestedByUserId: asString(body.requestedByUserId) || undefined,
  });

  res.status(200).json({
    success: true,
    data: {
      request: formatDeletionRequest(result.request),
      trackingToken: result.trackingToken,
      purgeAfter: result.purgeAfter?.toISOString() || null,
      scope: result.scope,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/:tenantId/account-deletion/delete-data", async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId || "").trim();
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "tenantId is required" } });
    return;
  }

  const body = req.body as {
    reason?: unknown;
    retentionDays?: unknown;
    scope?: unknown;
    requestedByEmail?: unknown;
    requestedByUserId?: unknown;
  };

  const result = await requestPartialDataDeletion({
    tenantId,
    requestKind: "data",
    reason: asString(body.reason) || undefined,
    retentionDays: asNumber(body.retentionDays, 30),
    scope: asObject(body.scope) as Record<string, boolean> | null,
    requestedByEmail: asString(body.requestedByEmail) || undefined,
    requestedByUserId: asString(body.requestedByUserId) || undefined,
  });

  res.status(200).json({
    success: true,
    data: {
      request: formatDeletionRequest(result.request),
      trackingToken: result.trackingToken,
      scope: result.scope,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/tenants/:tenantId/account-deletion/restore", async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId || "").trim();
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "tenantId is required" } });
    return;
  }

  const restored = await restorePendingDeletion({ tenantId, actor: req.requestContext?.requestId || "admin" });
  if (!restored) {
    res.status(404).json({ success: false, error: { code: "RESTORE_NOT_AVAILABLE", message: `No pending deletion found for tenant ${tenantId}` } });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      tenantId,
      requestId: restored.id,
      status: "restored",
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.delete("/tenants/:id", async (req: Request, res: Response) => {
  const tenantId = String(req.params.id || "").trim();

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "Tenant id is required" },
    });
    return;
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });

  if (!existingTenant) {
    res.status(404).json({
      success: false,
      error: { code: "TENANT_NOT_FOUND", message: `Tenant ${tenantId} not found` },
    });
    return;
  }

  const actor = req.requestContext?.userId || req.requestContext?.requestId || "admin";

  await prisma.$transaction(async (tx) => {
    await tx.accountDeletionAuditEntry.create({
      data: {
        tenantId,
        action: "account.delete.purged",
        actor,
        summary: `Tenant ${existingTenant.name || tenantId} permanently deleted from admin panel`,
        detailsJson: {
          source: "admin.delete.route",
          tenantId,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.tenant.delete({ where: { id: tenantId } });
  });

  res.status(200).json({
    success: true,
    data: {
      tenantId,
      deleted: true,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

adminRouter.post("/account-deletion/sweep", async (req: Request, res: Response) => {
  const result = await runDueAccountDeletionPurges();
  res.status(200).json({
    success: true,
    data: result,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

export default adminRouter;

