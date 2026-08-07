import fs from "fs/promises";
import path from "path";

import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import {
  BackendControlActionName,
  BackendControlAuditEntry,
  BackendControlFieldSchema,
  BackendControlSchema,
  BackendControlSnapshot,
  BackendControlState,
  BackendControlUpdateInput,
} from "../../shared/contracts/admin";
import { RoomServiceClient } from "livekit-server-sdk";

const RUNTIME_DIR = path.resolve(process.cwd(), ".runtime");
const STATE_FILE = path.join(RUNTIME_DIR, "backend-control.json");
const MAX_AUDIT_LOG = 50;
const DEFAULT_ROLE = "developer";

const BACKEND_CONTROL_SCHEMA: BackendControlSchema = {
  version: 1,
  sections: [
    {
      key: "runtime",
      label: "Runtime Controls",
      description: "Live switches that change how backend traffic is accepted and processed.",
      fields: [
        { key: "backendEnabled", label: "Backend Enabled", type: "toggle", section: "runtime", critical: true, role: ["ops", "admin", "developer"], source: "runtime" },
        { key: "maintenanceMode", label: "Maintenance Mode", type: "toggle", section: "runtime", critical: true, role: ["ops", "admin"], source: "runtime" },
        { key: "webhookBridgeEnabled", label: "Webhook Bridge", type: "toggle", section: "runtime", role: ["developer", "ops", "admin"], source: "runtime" },
        { key: "voiceTestMode", label: "Voice Test Mode", type: "toggle", section: "runtime", role: ["developer", "ops", "admin"], source: "runtime" },
        { key: "billingBypass", label: "Billing Bypass", type: "toggle", section: "runtime", critical: true, role: ["ops", "admin"], source: "runtime" },
        { key: "queuePaused", label: "Queue Paused", type: "toggle", section: "runtime", role: ["ops", "admin", "developer"], source: "runtime" },
        { key: "outboundCallingEnabled", label: "Outbound Calling", type: "toggle", section: "runtime", role: ["ops", "admin", "developer"], source: "runtime" },
        { key: "rateLimitMode", label: "Rate Limit Mode", type: "select", section: "runtime", role: ["developer", "ops", "admin"], source: "runtime", options: [
          { label: "Off", value: "off" },
          { label: "Soft", value: "soft" },
          { label: "Strict", value: "strict" },
        ] },
        { key: "autoRetryEnabled", label: "Auto Retry", type: "toggle", section: "runtime", role: ["developer", "ops", "admin"], source: "runtime" },
      ],
    },
    {
      key: "integrations",
      label: "Integrations",
      description: "External connectivity and credential status for voice and billing providers.",
      fields: [
        { key: "payuMode", label: "PayU Mode", type: "select", section: "integrations", source: "runtime", role: ["developer", "ops", "admin"], options: [
          { label: "Test", value: "test" },
          { label: "Live", value: "live" },
        ] },
        { key: "payuServerReturnBase", label: "PayU Server Return Base", type: "text", section: "integrations", source: "runtime", role: ["developer", "ops", "admin"], description: "Public base URL used for PayU server callbacks (overrides PAYU_SERVER_RETURN_BASE)" },
        { key: "payuFrontendTarget", label: "PayU Frontend Target", type: "select", section: "integrations", source: "runtime", role: ["developer", "ops", "admin"], options: [
          { label: "Local (localhost)", value: "local" },
          { label: "Production (maxsasrealtyai.in)", value: "production" },
        ], description: "Choose which frontend host should be targeted for PayU frontend redirects" },
        { key: "livekitUrl", label: "LiveKit URL", type: "text", section: "integrations", source: "env", role: ["developer", "ops", "admin"] },
        { key: "livekitApiKeyState", label: "LiveKit API Key", type: "badge", section: "integrations", source: "env", role: ["developer", "ops", "admin"] },
        { key: "livekitApiSecretState", label: "LiveKit API Secret", type: "badge", section: "integrations", source: "env", role: ["developer", "ops", "admin"] },
        { key: "sipTrunkId", label: "SIP Trunk", type: "text", section: "integrations", source: "env", role: ["developer", "ops", "admin"] },
        { key: "webhookUrl", label: "Webhook URL", type: "text", section: "integrations", source: "env", role: ["developer", "ops", "admin"] },
        { key: "webhookTokenState", label: "Webhook Token", type: "badge", section: "integrations", source: "env", role: ["developer", "ops", "admin"] },
        { key: "agentServerUrl", label: "Agent Server", type: "text", section: "integrations", source: "env", role: ["developer", "ops", "admin"] },
        { key: "paymentGatewayStatus", label: "Payment Gateway", type: "badge", section: "integrations", source: "computed", role: ["developer", "ops", "admin"] },
      ],
    },
    {
      key: "processing",
      label: "Processing Controls",
      description: "Queue, retry, and voice-processing limits used by workers and webhooks.",
      fields: [
        { key: "outboundQueueConcurrency", label: "Outbound Queue Concurrency", type: "number", section: "processing", min: 1, max: 50, step: 1, source: "runtime", role: ["developer", "ops", "admin"] },
        { key: "webhookPollIntervalMs", label: "Webhook Poll Interval (ms)", type: "number", section: "processing", min: 1000, max: 60000, step: 500, source: "runtime", role: ["developer", "ops", "admin"] },
        { key: "eventRetryCount", label: "Event Retry Count", type: "number", section: "processing", min: 0, max: 10, step: 1, source: "runtime", role: ["developer", "ops", "admin"] },
        { key: "eventRetryBaseDelayMs", label: "Retry Base Delay (ms)", type: "number", section: "processing", min: 100, max: 60000, step: 100, source: "runtime", role: ["developer", "ops", "admin"] },
        { key: "requestTimeoutMs", label: "Request Timeout (ms)", type: "number", section: "processing", min: 1000, max: 120000, step: 1000, source: "runtime", role: ["developer", "ops", "admin"] },
        { key: "maxCallDurationSec", label: "Max Call Duration (sec)", type: "number", section: "processing", min: 60, max: 7200, step: 30, source: "runtime", role: ["developer", "ops", "admin"] },
        { key: "voicemailAutoHangupPolicy", label: "Voicemail Auto-Hangup", type: "select", section: "processing", source: "runtime", role: ["developer", "ops", "admin"], options: [
          { label: "Off", value: "off" },
          { label: "15 seconds", value: "seconds-15" },
          { label: "30 seconds", value: "seconds-30" },
          { label: "45 seconds", value: "seconds-45" },
        ] },
        { key: "classifierEnabled", label: "Classifier Enabled", type: "toggle", section: "processing", source: "runtime", role: ["developer", "ops", "admin"] },
      ],
    },
    {
      key: "safety",
      label: "Safety Controls",
      description: "Kill switches and emergency overrides that must be visible in one place.",
      fields: [
        { key: "dryRunMode", label: "Dry-Run Mode", type: "toggle", section: "safety", critical: true, source: "runtime", role: ["ops", "admin"] },
        { key: "sandboxMode", label: "Sandbox Mode", type: "toggle", section: "safety", source: "runtime", role: ["developer", "ops", "admin"] },
        { key: "tenantCapabilityOverride", label: "Tenant Capability Override", type: "select", section: "safety", source: "runtime", role: ["ops", "admin"], options: [
          { label: "Inherit", value: "inherit" },
          { label: "Force On", value: "force-on" },
          { label: "Force Off", value: "force-off" },
        ] },
        { key: "adminOnlyTriggerLock", label: "Admin-Only Trigger Lock", type: "toggle", section: "safety", critical: true, source: "runtime", role: ["ops", "admin"] },
        { key: "emergencyStopCallCreation", label: "Emergency Stop Call Creation", type: "toggle", section: "safety", critical: true, source: "runtime", role: ["ops", "admin"] },
      ],
    },
    {
      key: "observability",
      label: "Observability",
      description: "Live state, recent changes, and operational breadcrumbs.",
      fields: [
        { key: "backendHealth", label: "Backend Health", type: "badge", section: "observability", source: "computed", role: ["developer", "ops", "admin"] },
        { key: "queueDepth", label: "Queue Depth", type: "readonly", section: "observability", source: "computed", role: ["developer", "ops", "admin"] },
        { key: "webhookFailures", label: "Webhook Failures", type: "readonly", section: "observability", source: "computed", role: ["developer", "ops", "admin"] },
        { key: "lastCallTriggerResult", label: "Last Call Trigger", type: "readonly", section: "observability", source: "computed", role: ["developer", "ops", "admin"] },
        { key: "lastEventIngest", label: "Last Event Ingest", type: "readonly", section: "observability", source: "computed", role: ["developer", "ops", "admin"] },
      ],
    },
    {
      key: "persistence",
      label: "Config Persistence",
      description: "Saved runtime state, source badges, and change history.",
      role: ["developer", "ops", "admin"],
      fields: [
        { key: "saveState", label: "Save State", type: "readonly", section: "persistence", source: "runtime", role: ["developer", "ops", "admin"] },
      ],
    },
  ],
};

const DEFAULT_STATE: BackendControlState = {
  runtime: {
    backendEnabled: true,
    maintenanceMode: false,
    webhookBridgeEnabled: Boolean(config.isWebhookBridgeEnabled),
    voiceTestMode: Boolean(config.isTestMode),
    billingBypass: Boolean(config.isBillingBypass),
    queuePaused: false,
    outboundCallingEnabled: true,
    rateLimitMode: "soft",
    autoRetryEnabled: true,
  },
  integrations: {
    livekitUrl: config.LIVEKIT_URL || "",
    livekitApiKeyState: config.LIVEKIT_API_KEY ? "configured" : "missing",
    livekitApiSecretState: config.LIVEKIT_API_SECRET ? "configured" : "missing",
    sipTrunkId: config.sipTrunkId || "",
    webhookUrl: config.voiceWebhookUrl,
    webhookTokenState: config.webhookAuthToken ? "configured" : "missing",
    agentServerUrl: config.webhookBridgeSourceUrl,
    paymentGatewayStatus: "configured",
    payuMode: config.PAYU_MODE || "",
    payuServerReturnBase: (process.env.PAYU_SERVER_RETURN_BASE || "").trim(),
    payuFrontendTarget: "production",
  },
  processing: {
    outboundQueueConcurrency: Number(config.OUTBOUND_QUEUE_CONCURRENCY || 5),
    webhookPollIntervalMs: Number(config.webhookBridgePollMs || 4000),
    eventRetryCount: 3,
    eventRetryBaseDelayMs: 1000,
    requestTimeoutMs: 8000,
    maxCallDurationSec: 1800,
    voicemailAutoHangupPolicy: "seconds-30",
    classifierEnabled: true,
  },
  safety: {
    perFeatureKillSwitches: {},
    dryRunMode: false,
    sandboxMode: false,
    tenantCapabilityOverride: "inherit",
    adminOnlyTriggerLock: false,
    emergencyStopCallCreation: false,
  },
};

type PersistedBackendControlFile = {
  version: number;
  updatedAt: string | null;
  state: BackendControlState;
  auditLog: BackendControlAuditEntry[];
};

let cachedFile: PersistedBackendControlFile | null = null;

function cloneState(state: BackendControlState): BackendControlState {
  return JSON.parse(JSON.stringify(state)) as BackendControlState;
}

function getDefaults(): BackendControlState {
  return cloneState(DEFAULT_STATE);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeState(input: Partial<BackendControlState> | null | undefined): BackendControlState {
  const base = getDefaults();
  if (!input) {
    return base;
  }

  return {
    runtime: {
      ...base.runtime,
      ...(isPlainObject(input.runtime) ? input.runtime : {}),
    },
    integrations: {
      ...base.integrations,
      ...(isPlainObject(input.integrations) ? input.integrations : {}),
    },
    processing: {
      ...base.processing,
      ...(isPlainObject(input.processing) ? input.processing : {}),
    },
    safety: {
      ...base.safety,
      ...(isPlainObject(input.safety) ? input.safety : {}),
      perFeatureKillSwitches: {
        ...base.safety.perFeatureKillSwitches,
        ...(isPlainObject(input.safety?.perFeatureKillSwitches) ? input.safety.perFeatureKillSwitches : {}),
      },
    },
  };
}

function createAuditEntry(action: string, summary: string, actor = DEFAULT_ROLE): BackendControlAuditEntry {
  return {
    id: `bca_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor,
    action,
    summary,
  };
}

function statesEqual(left: BackendControlState, right: BackendControlState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readStoredFile(): Promise<PersistedBackendControlFile> {
  if (cachedFile) {
    return cachedFile;
  }

  try {
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as PersistedBackendControlFile;
    cachedFile = {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      state: normalizeState(parsed.state),
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog.slice(0, MAX_AUDIT_LOG) : [],
    };
    return cachedFile;
  } catch {
    cachedFile = {
      version: 1,
      updatedAt: null,
      state: getDefaults(),
      auditLog: [],
    };
    return cachedFile;
  }
}

async function writeStoredFile(file: PersistedBackendControlFile): Promise<void> {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  cachedFile = file;
  await fs.writeFile(STATE_FILE, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
}

function buildSources(): BackendControlSnapshot["sources"] {
  return {
    runtime: {
      backendEnabled: "runtime",
      maintenanceMode: "runtime",
      webhookBridgeEnabled: "runtime",
      voiceTestMode: "runtime",
      billingBypass: "runtime",
      queuePaused: "runtime",
      outboundCallingEnabled: "runtime",
      rateLimitMode: "runtime",
      autoRetryEnabled: "runtime",
    },
    integrations: {
      livekitUrl: config.LIVEKIT_URL ? "env" : "readonly",
      livekitApiKeyState: "env",
      livekitApiSecretState: "env",
      sipTrunkId: config.sipTrunkId ? "env" : "readonly",
      webhookUrl: "env",
      webhookTokenState: "env",
      agentServerUrl: "env",
      paymentGatewayStatus: "computed",
      payuMode: "runtime",
      payuServerReturnBase: "runtime",
      payuFrontendTarget: "runtime",
    },
    processing: {
      outboundQueueConcurrency: "runtime",
      webhookPollIntervalMs: "runtime",
      eventRetryCount: "runtime",
      eventRetryBaseDelayMs: "runtime",
      requestTimeoutMs: "runtime",
      maxCallDurationSec: "runtime",
      voicemailAutoHangupPolicy: "runtime",
      classifierEnabled: "runtime",
    },
    safety: {
      perFeatureKillSwitches: "runtime",
      dryRunMode: "runtime",
      sandboxMode: "runtime",
      tenantCapabilityOverride: "runtime",
      adminOnlyTriggerLock: "runtime",
      emergencyStopCallCreation: "runtime",
    },
    observability: {
      backendHealth: "computed",
      queueDepth: "computed",
      webhookFailures: "computed",
      lastCallTriggerResult: "computed",
      lastEventIngest: "computed",
    },
    persistence: {
      saveState: "readonly",
    },
  };
}

function buildObservabilityFromState(state: BackendControlState, auditLog: BackendControlAuditEntry[]): BackendControlSnapshot["observability"] {
  const latestAction = auditLog[0] || null;
  const backendHealth = state.runtime.backendEnabled && !state.runtime.maintenanceMode ? "ok" : "degraded";

  return {
    backendHealth,
    queueDepth: state.runtime.queuePaused ? 1 : 0,
    webhookFailures: 0,
    lastCallTriggerResult: latestAction ? `${latestAction.action}: ${latestAction.summary}` : null,
    lastEventIngest: latestAction ? latestAction.at : null,
    recentConfigChanges: auditLog.slice(0, 10),
    auditLog,
  };
}

async function getPersistedSnapshot(): Promise<PersistedBackendControlFile> {
  return readStoredFile();
}

export async function getBackendControlSnapshot(): Promise<BackendControlSnapshot> {
  const stored = await getPersistedSnapshot();
  const state = normalizeState(stored.state);
  const auditLog = Array.isArray(stored.auditLog) ? stored.auditLog.slice(0, MAX_AUDIT_LOG) : [];

  return {
    schema: BACKEND_CONTROL_SCHEMA,
    state,
    sources: buildSources(),
    dirty: !statesEqual(state, DEFAULT_STATE),
    updatedAt: stored.updatedAt,
    observability: buildObservabilityFromState(state, auditLog),
  };
}

export async function updateBackendControlSettings(input: BackendControlUpdateInput, actor = DEFAULT_ROLE, reason = "settings update"): Promise<BackendControlSnapshot> {
  // Safety: prevent enabling live PayU in local safety mode unless explicitly allowed
  try {
    if (
      input.integrations &&
      (input.integrations as any).payuMode === "live" &&
      config.isLocalSafetyMode &&
      !config.allowDangerousLocalSideEffects
    ) {
      throw new Error("Refusing to enable PayU live mode while local safety mode is active. Set ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS=true to override.");
    }
  } catch (err) {
    throw err;
  }
  const current = await getPersistedSnapshot();
  const merged = normalizeState({
    runtime: {
      ...current.state.runtime,
      ...(input.runtime || {}),
    },
    integrations: {
      ...current.state.integrations,
      ...(input.integrations || {}),
    },
    processing: {
      ...current.state.processing,
      ...(input.processing || {}),
    },
    safety: {
      ...current.state.safety,
      ...(input.safety || {}),
      perFeatureKillSwitches: {
        ...current.state.safety.perFeatureKillSwitches,
        ...(input.safety?.perFeatureKillSwitches || {}),
      },
    },
  });

  const nextFile: PersistedBackendControlFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    state: merged,
    auditLog: [
      createAuditEntry("settings.update", reason, actor),
      ...(current.auditLog || []),
    ].slice(0, MAX_AUDIT_LOG),
  };

  await writeStoredFile(nextFile);
  logger.info("Backend control state updated", { actor, reason });
  return getBackendControlSnapshot();
}

export async function resetBackendControlSettings(actor = DEFAULT_ROLE): Promise<BackendControlSnapshot> {
  const nextFile: PersistedBackendControlFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    state: getDefaults(),
    auditLog: [createAuditEntry("settings.reset", "reset to defaults", actor)],
  };

  await writeStoredFile(nextFile);
  logger.info("Backend control state reset", { actor });
  return getBackendControlSnapshot();
}

export async function appendBackendControlAudit(action: string, summary: string, actor = DEFAULT_ROLE): Promise<void> {
  const current = await getPersistedSnapshot();
  const nextFile: PersistedBackendControlFile = {
    version: 1,
    updatedAt: current.updatedAt,
    state: current.state,
    auditLog: [createAuditEntry(action, summary, actor), ...(current.auditLog || [])].slice(0, MAX_AUDIT_LOG),
  };
  await writeStoredFile(nextFile);
}

export async function getBackendControlState(): Promise<BackendControlState> {
  const snapshot = await getBackendControlSnapshot();
  return snapshot.state;
}

export async function isBackendDisabled(): Promise<boolean> {
  const state = await getBackendControlState();
  return !state.runtime.backendEnabled || state.runtime.maintenanceMode || state.safety.emergencyStopCallCreation;
}

export async function shouldAllowOutboundCalling(): Promise<boolean> {
  const state = await getBackendControlState();
  return state.runtime.backendEnabled && !state.runtime.maintenanceMode && state.runtime.outboundCallingEnabled && !state.safety.emergencyStopCallCreation;
}

export async function shouldPauseOutboundQueue(): Promise<boolean> {
  const state = await getBackendControlState();
  return state.runtime.queuePaused || !state.runtime.backendEnabled || state.runtime.maintenanceMode;
}

export async function shouldBypassBilling(): Promise<boolean> {
  const state = await getBackendControlState();
  return state.runtime.billingBypass || state.runtime.voiceTestMode;
}

export async function isWebhookBridgeActive(): Promise<boolean> {
  const state = await getBackendControlState();
  return state.runtime.webhookBridgeEnabled && state.runtime.backendEnabled && !state.runtime.maintenanceMode;
}

export async function getOutboundQueueConcurrency(): Promise<number> {
  const state = await getBackendControlState();
  return state.processing.outboundQueueConcurrency;
}

export async function processQueuedOutboundRequests(): Promise<{ queued: number; enqueued: number }> {
  const queuedRequests = await prisma.outboundCallRequest.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, tenantId: true },
  });

  let enqueued = 0;
  const { enqueueOutboundCallRequestJob } = await import("../queue/producer");
  for (const request of queuedRequests) {
    try {
      await enqueueOutboundCallRequestJob({ requestId: request.id, tenantId: request.tenantId });
      enqueued += 1;
    } catch (error) {
      logger.warn("Failed to enqueue queued outbound request", {
        requestId: request.id,
        tenantId: request.tenantId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { queued: queuedRequests.length, enqueued };
}

export async function restartOutboundWorkerWithRuntimeSettings(): Promise<void> {
  const { restartOutboundCallWorker } = await import("../queue/worker");
  await restartOutboundCallWorker();
}

export async function pauseOutboundWorkerRuntime(): Promise<void> {
  const { pauseOutboundCallWorker } = await import("../queue/worker");
  await pauseOutboundCallWorker();
}

export async function resumeOutboundWorkerRuntime(): Promise<void> {
  const { resumeOutboundCallWorker } = await import("../queue/worker");
  await resumeOutboundCallWorker();
}

export async function pingLivekit(): Promise<{ success: boolean; message: string }> {
  if (config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects) {
    return { success: true, message: "Skipped LiveKit ping in local safety mode" };
  }

  if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) {
    return { success: false, message: "LiveKit credentials are incomplete" };
  }

  try {
    const roomClient = new RoomServiceClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
    await roomClient.listRooms(["backend-control-ping"]);
    return { success: true, message: "LiveKit reachable" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  }
}

export async function testWebhookRoute(): Promise<{ success: boolean; message: string }> {
  if (config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects) {
    return { success: true, message: "Skipped webhook test in local safety mode" };
  }

  if (!config.voiceWebhookUrl || !config.webhookAuthToken) {
    return { success: false, message: "Webhook URL or token is not configured" };
  }

  try {
    const response = await fetch(config.voiceWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.webhookAuthToken}`,
      },
      body: JSON.stringify({
        event_id: `backend-control-${Date.now()}`,
        event_type: "agent_log",
        tenant_id: "backend-control",
        call_id: `backend-control-${Date.now()}`,
        room_id: "backend-control",
        occurred_at: new Date().toISOString(),
        payload: {
          message: "backend control webhook test",
          level: "info",
        },
      }),
    });

    return {
      success: response.ok,
      message: response.ok ? "Webhook test accepted" : `Webhook test failed: HTTP ${response.status}`,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export const backendControlSchema = BACKEND_CONTROL_SCHEMA;
export type { BackendControlActionName, BackendControlState };
