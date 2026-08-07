import {
    CallDetail,
    CallSummary,
    InitiateCallRequest,
    InitiateCallResponse,
    RecordingResponse,
} from "../../shared/contracts";
import { computeLeadBucket } from "../../shared/leadOutcome";
import { CallLifecycleStatus } from "../generated/prisma";
import { config, normalizePhoneNumber } from "../lib/config";
import { logger } from "../lib/logger";
import { assertUuid } from "../lib/uuid";
import { enqueueOutboundCallRequestJob } from "../queue/producer";
import { getCachedTenantCapabilities } from "./accessService";
import { isBackendDisabled, shouldAllowOutboundCalling } from "./backendControlService";
import {
    getCallDetail,
    getCallSessionByExternalId,
    getCallSessionById,
    listCallSessions,
} from "../repositories/callRepository";
import { getLeadExtractionByCallId } from "../repositories/leadRepository";
import { createOutboundCallRequest } from "../repositories/outboundRequestRepository";
import { upsertTenant } from "../repositories/tenantRepository";
import { normalizeRequestedCallDurationLimitConfig } from "./accessService";

export async function initiateCallSession(input: InitiateCallRequest): Promise<InitiateCallResponse> {
  assertUuid(input.tenantId, "tenantId");
  let request;
  
  const contextLog = {
    tenant_id: input.tenantId,
    room_id: input.roomId,
    phone_number: input.phoneNumber,
    agent_name: input.agentName,
    direction: input.direction,
  };

  logger.info("Initiating call session", contextLog);

  try {
    if (await isBackendDisabled()) {
      throw new Error("Backend operations are disabled by the control panel");
    }

    if (!(await shouldAllowOutboundCalling()) && input.direction === "outbound") {
      throw new Error("Outbound calling is currently disabled");
    }

    await upsertTenant({ tenantId: input.tenantId });
    const tenantConfig = await getCachedTenantCapabilities(input.tenantId);
    const voiceCalling = tenantConfig.workspaceConfig.voiceCalling;

    const normalizedPhoneNumber = input.phoneNumber ? normalizePhoneNumber(input.phoneNumber) : null;
    const resolvedAgentName = input.agentName?.trim() || config.LIVEKIT_AGENT_NAME;
    const requestedVoiceCalling = input.voiceCalling ?? {
      callDurationLimitEnabled: input.callDurationLimitEnabled,
      callDurationLimitSec: input.callDurationLimitSec,
    };
    const normalizedVoiceCalling = normalizeRequestedCallDurationLimitConfig(requestedVoiceCalling);

    request = await createOutboundCallRequest({
      tenantId: input.tenantId,
      phoneNumber: normalizedPhoneNumber || "",
      roomId: input.roomId,
      agentName: resolvedAgentName,
      payloadJson: {
        direction: input.direction,
        requestedAt: new Date().toISOString(),
        voiceCalling: normalizedVoiceCalling,
      },
    });

    logger.info("Outbound call request created", {
      ...contextLog,
      call_id: request.id,
      status: request.status,
    });

    await enqueueOutboundCallRequestJob({
      requestId: request.id,
      tenantId: request.tenantId,
    });

    logger.info("Outbound call job enqueued", {
      ...contextLog,
      call_id: request.id,
    });
  } catch (error) {
    logger.error("Call initiation failed", {
      ...contextLog,
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return {
    callId: request.id,
    tenantId: request.tenantId,
    roomId: request.roomId,
    state: "queued",
    dispatch: {
      webhookUrl: config.voiceWebhookUrl,
      eventAuthMode: "bearer",
      expectedHeaders: ["X-Event-Id", "X-Call-Id", "X-Occurred-At"],
    },
  };
}

export async function listCalls(args: {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: CallLifecycleStatus;
  from?: Date;
  to?: Date;
}): Promise<{ items: CallSummary[]; totalItems: number }> {
  assertUuid(args.tenantId, "tenantId");
  const result = await listCallSessions(args);

  return {
    totalItems: result.totalItems,
    items: result.items.map((item) => ({
      callId: item.id,
      tenantId: item.tenantId,
      roomId: item.roomId,
      state: item.status,
      initiatedAt: item.initiatedAt.toISOString(),
      connectedAt: item.connectedAt?.toISOString(),
      completedAt: item.completedAt?.toISOString(),
      failedAt: item.failedAt?.toISOString(),
      raw_call_outcome: typeof item.callOutcome === "string" ? item.callOutcome : null,
      raw_call_outcome_confidence: typeof item.confidence === "number" ? item.confidence : null,
      lead_bucket: computeLeadBucket(typeof item.callOutcome === "string" ? item.callOutcome : null),
    })),
  };
}

export async function getCallById(callId: string, tenantId: string): Promise<CallDetail | null> {
  assertUuid(callId, "callId");
  assertUuid(tenantId, "tenantId");
  const detail = await getCallDetail(callId, tenantId);
  if (!detail) {
    return null;
  }

  const eventSummaryMap = detail.events.reduce<Record<string, number>>((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] || 0) + 1;
    return acc;
  }, {});

  return {
    callId: detail.id,
    tenantId: detail.tenantId,
    roomId: detail.roomId,
    state: detail.status,
    initiatedAt: detail.initiatedAt.toISOString(),
    connectedAt: detail.connectedAt?.toISOString(),
    completedAt: detail.completedAt?.toISOString(),
    failedAt: detail.failedAt?.toISOString(),
    raw_call_outcome: typeof detail.callOutcome === "string" ? detail.callOutcome : null,
    raw_call_outcome_confidence: typeof detail.confidence === "number" ? detail.confidence : null,
    lead_bucket: computeLeadBucket(typeof detail.callOutcome === "string" ? detail.callOutcome : null),
    phoneNumber: detail.phoneNumber,
    agentName: detail.agentName,
    direction: detail.direction,
    durationSec: detail.durationSec,
    transcriptTurns: detail.transcriptTurns,
    recordingUrl: detail.recordingUrl,
    estimatedCost: detail.estimatedCost ? Number(detail.estimatedCost) : null,
    lastError: detail.lastError,
    eventSummary: Object.entries(eventSummaryMap).map(([eventType, count]) => ({
      eventType,
      count,
    })),
  };
}

export async function getRecordingMetadata(
  callId: string,
  tenantId: string
): Promise<RecordingResponse | null> {
  assertUuid(callId, "callId");
  assertUuid(tenantId, "tenantId");
  const call = await getCallSessionById(callId, tenantId);
  if (!call) {
    return null;
  }

  const signedUrl = call.recordingUrl ? call.recordingUrl : null;

  return {
    callId,
    tenantId,
    available: Boolean(call.recordingUrl),
    recordingUrl: call.recordingUrl,
    signedUrl,
  };
}

export async function getLeadByCallId(callId: string, tenantId: string) {
  assertUuid(callId, "callId");
  assertUuid(tenantId, "tenantId");

  let callSession = await getCallSessionById(callId, tenantId);
  if (!callSession) {
    callSession = await getCallSessionByExternalId(callId, tenantId);
  }

  if (!callSession) {
    return null;
  }

  const lead = await getLeadExtractionByCallId(callSession.id, tenantId);
  if (!lead) {
    return null;
  }

  return {
    callId: callSession.id,
    tenantId,
    extractedAt: lead.extractedAt.toISOString(),
    fields: {
      name: lead.name,
      phone: lead.phone,
      summary: lead.summary,
      propertyType: lead.propertyType,
      preferredLocation: lead.preferredLocation,
      budgetRange: lead.budgetRange,
      timeline: lead.timeline,
    },
    confidence: lead.confidence,
    raw_data: lead.rawJson,
  };
}
