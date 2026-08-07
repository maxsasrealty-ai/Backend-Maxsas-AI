import {
    CallAnalysisCompletedPayload,
    CallCompletedPayload,
    CallFailedPayload,
    CallStartedPayload,
    CallTranscriptFinalPayload,
    LeadExtractedPayload,
    NormalizedVoiceEvent,
    TranscriptEventPayload,
    VoiceEventEnvelope,
    VoiceEventHeaders,
    VoiceEventPayload,
    VoiceEventType,
  } from "../../shared/contracts/voice-events";
import { Prisma } from "../generated/prisma";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { assertUuid, isUuid } from "../lib/uuid";
import {
    bindExternalCallId,
    createCallSession,
    getCallSessionByExternalId,
    getCallSessionById,
    updateCallSessionState,
} from "../repositories/callRepository";
import { createCallEvent, findEventByDedupKey } from "../repositories/eventRepository";
  import { recordCallBillingTransaction } from "../repositories/callBillingRepository";
import { upsertLeadExtraction } from "../repositories/leadRepository";
import { upsertTenant } from "../repositories/tenantRepository";
import { upsertTranscriptSegment } from "../repositories/transcriptRepository";
import { deriveStateFromEvent, transitionOrStay } from "./calls/callStateMachine";
import { publishRealtimeVoiceEvent } from "./realtimeService";

const SUPPORTED_EVENT_TYPES: Set<VoiceEventType> = new Set([
  "call_started",
  "call_ringing",
  "call_connected",
  "call_active",
  "call_transcript_final",
  "lead_extracted",
  "call_analysis_completed",
  "call_completed",
  "call_failed",
  "transcript_partial",
  "transcript_final",
  "publisher_test",
  "agent_log",
]);

const processedEventIds = new Set<string>();

export interface VoiceEventValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateVoiceEventEnvelope(envelope: unknown): VoiceEventValidationResult {
  const errors: string[] = [];

  if (!envelope || typeof envelope !== "object") {
    return { isValid: false, errors: ["Envelope must be an object"] };
  }

  const candidate = envelope as Partial<VoiceEventEnvelope>;

  if (!candidate.event_type || !SUPPORTED_EVENT_TYPES.has(candidate.event_type as VoiceEventType)) {
    errors.push("Unsupported or missing event_type");
  }

  if (!candidate.tenant_id || typeof candidate.tenant_id !== "string") {
    errors.push("Missing tenant_id");
  }

  if (!candidate.call_id || typeof candidate.call_id !== "string") {
    errors.push("Missing call_id");
  }

  if (!candidate.room_id || typeof candidate.room_id !== "string") {
    errors.push("Missing room_id");
  }

  if (!candidate.occurred_at || typeof candidate.occurred_at !== "string") {
    errors.push("Missing occurred_at");
  }

  if (typeof candidate.payload !== "object" || candidate.payload === null) {
    errors.push("Missing payload");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function normalizeVoiceEvent(args: {
  envelope: VoiceEventEnvelope;
  headers: VoiceEventHeaders;
  rawEnvelope: unknown;
  rawHeaders: Record<string, string | string[] | undefined>;
}): NormalizedVoiceEvent {
  const { envelope, headers, rawEnvelope, rawHeaders } = args;

  return {
    eventId: headers.eventId,
    eventType: envelope.event_type,
    tenantId: envelope.tenant_id,
    callId: envelope.call_id,
    roomId: envelope.room_id,
    occurredAt: envelope.occurred_at,
    payload: envelope.payload,
    rawEnvelope,
    rawHeaders,
  };
}

export async function markEventAsProcessing(args: {
  tenantId: string;
  eventId: string;
  callId: string;
  eventType: VoiceEventType;
  occurredAt: string;
}): Promise<{ accepted: boolean; reason?: string }> {
  const { eventId, tenantId } = args;
  assertUuid(tenantId, "tenantId");

  if (processedEventIds.has(eventId)) {
    return {
      accepted: false,
      reason: "DUPLICATE_EVENT",
    };
  }

  const existing = await findEventByDedupKey({
    tenantId,
    eventId,
  });

  if (existing) {
    return {
      accepted: false,
      reason: "DUPLICATE_EVENT",
    };
  }

  processedEventIds.add(eventId);
  return { accepted: true };
}

function toJsonValue(input: unknown): Prisma.InputJsonValue {
  return (input ?? Prisma.JsonNull) as Prisma.InputJsonValue;
}

function safeFloat(input: unknown): number | undefined {
  const num = Number(input);
  return Number.isFinite(num) ? num : undefined;
}

function mapSpeaker(raw: unknown): "user" | "agent" | "person" {
  const s = String(raw || "agent").toLowerCase();
  if (s === "agent") return "agent";
  if (s === "person" || s === "user" || s === "human") return "person";
  return "agent";
}

async function ensureCallSessionExists(
  event: NormalizedVoiceEvent,
  db: Prisma.TransactionClient
) {
  assertUuid(event.tenantId, "tenantId");

  const existingByExternal = await getCallSessionByExternalId(event.callId, event.tenantId, db);
  if (existingByExternal) {
    return existingByExternal;
  }

  if (isUuid(event.callId)) {
    const existingByInternal = await getCallSessionById(event.callId, event.tenantId, db);
    if (existingByInternal) {
      if (!existingByInternal.externalCallId) {
        const rebound = await bindExternalCallId({
          callId: existingByInternal.id,
          tenantId: event.tenantId,
          externalCallId: event.callId,
          db,
        });
        if (rebound) {
          return rebound;
        }
      }
      return existingByInternal;
    }

    return createCallSession({
      callId: event.callId,
      tenantId: event.tenantId,
      externalCallId: event.callId,
      roomId: event.roomId,
      state: "dispatching",
      db,
    });
  }

  return createCallSession({
    tenantId: event.tenantId,
    externalCallId: event.callId,
    roomId: event.roomId,
    state: "dispatching",
    db,
  });
}

async function applyEventPayloadEffects(args: {
  event: NormalizedVoiceEvent;
  callSessionId: string;
  db: Prisma.TransactionClient;
}): Promise<void> {
  const { event, callSessionId, db } = args;
  
  if (event.eventType === "call_transcript_final") {
    const payload = event.payload as CallTranscriptFinalPayload;
    if (Array.isArray(payload.turns)) {
      for (const turn of payload.turns) {
        await upsertTranscriptSegment({
          callId: callSessionId,
          tenantId: event.tenantId,
          speaker: mapSpeaker(turn.speaker),
          text: turn.text,
          isFinal: true,
          sequenceNo: turn.sequenceNo,
          rawJson: toJsonValue(turn),
          occurredAt: new Date(event.occurredAt),
          db,
        });
      }
    }
    return;
  }

  if (event.eventType === "transcript_partial" || event.eventType === "transcript_final") {
    const payload = event.payload as TranscriptEventPayload;
    await upsertTranscriptSegment({
      callId: callSessionId,
      tenantId: event.tenantId,
      speaker: mapSpeaker(payload.speaker),
      text: payload.text,
      isFinal: payload.final,
      sequenceNo: payload.sequence_no,
      providerMessageId: payload.provider_message_id,
      rawJson: toJsonValue(payload.raw),
      occurredAt: new Date(event.occurredAt),
      db,
    });
    return;
  }

  if (event.eventType === "lead_extracted") {
    const payload = event.payload as LeadExtractedPayload;
    const confidenceOverall = payload.confidence ? safeFloat(payload.confidence.overall) : undefined;
    
    await upsertLeadExtraction({
      callId: callSessionId,
      tenantId: event.tenantId,
      extractedAt: new Date(event.occurredAt),
      propertyType: payload.property_type,
      preferredLocation: payload.preferred_location,
      budgetRange: payload.budget_range,
      timeline: payload.purchase_timeline,
      confidence: confidenceOverall,
      rawJson: toJsonValue(payload),
      db,
    });
  }

  if (event.eventType === "call_analysis_completed") {
    const payload = event.payload as CallAnalysisCompletedPayload & Record<string, unknown>;
    const lead = (payload.lead && typeof payload.lead === "object")
      ? payload.lead as Record<string, unknown>
      : payload;
    const callOutcome =
      typeof payload.call_outcome === "string" && payload.call_outcome
        ? payload.call_outcome
        : typeof payload.final_output === "string" && payload.final_output
          ? payload.final_output
          : typeof payload.disposition === "string" && payload.disposition
            ? payload.disposition
            : typeof payload.classification_label === "string" && payload.classification_label
              ? payload.classification_label
              : null;

    await upsertLeadExtraction({
      callId: callSessionId,
      tenantId: event.tenantId,
      extractedAt: new Date(event.occurredAt),
      propertyType: typeof lead.property_type === "string" ? lead.property_type : null,
      preferredLocation: typeof lead.location === "string" ? lead.location : typeof payload.preferred_location === "string" ? payload.preferred_location : null,
      budgetRange: typeof lead.budget === "string" ? lead.budget : typeof payload.budget_range === "string" ? payload.budget_range : null,
      timeline: typeof lead.timeline === "string" ? lead.timeline : typeof payload.purchase_timeline === "string" ? payload.purchase_timeline : null,
      confidence: safeFloat(payload.confidence),
      rawJson: toJsonValue({
        ...payload,
        call_outcome: callOutcome,
      }),
      db,
    });

    await updateCallSessionState({
      callId: callSessionId,
      tenantId: event.tenantId,
      state: transitionOrStay((await getCallSessionById(callSessionId, event.tenantId, db))?.status || "active", "completed"),
      completedAt: new Date(event.occurredAt),
      durationSec: safeFloat(payload.duration_sec ?? payload.durationSec),
      transcriptTurns: safeFloat(payload.transcript_turns ?? payload.transcriptTurns),
      callOutcome,
      endedBy: typeof payload.ended_by === "string" ? payload.ended_by : typeof payload.endedBy === "string" ? payload.endedBy : undefined,
      db,
    });
  }
}

async function applyStateTransition(args: {
  event: NormalizedVoiceEvent;
  callId: string;
  db: Prisma.TransactionClient;
}): Promise<void> {
  const { event, callId, db } = args;
  const call = await getCallSessionById(callId, event.tenantId, db);
  if (!call) return;

  const target = deriveStateFromEvent(event.eventType);
  if (!target) {
    return;
  }

  const nextState = transitionOrStay(call.status, target);

  const transitionPayload: {
    connectedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    durationSec?: number;
    transcriptTurns?: number;
    recordingUrl?: string | null;
    lastError?: string | null;
    callOutcome?: string | null;
    endedBy?: string | null;
    confidence?: number | null;
  } = {};

  if (event.eventType === "call_started") {
    const payload = event.payload as CallStartedPayload;
    if (payload.status === "started") {
      transitionPayload.connectedAt = new Date(event.occurredAt);
    }
  }

  if (event.eventType === "call_completed") {
    const payload = event.payload as CallCompletedPayload & Record<string, unknown>;
    transitionPayload.completedAt = new Date(event.occurredAt);
    transitionPayload.durationSec = safeFloat(payload.duration_sec ?? payload.durationSec);
    transitionPayload.transcriptTurns = safeFloat(payload.transcript_turns ?? payload.transcriptTurns);
    // agent call_completed provides ended_by / endedBy and null recording_url
    transitionPayload.endedBy = typeof payload.ended_by === "string"
      ? payload.ended_by
      : typeof payload.endedBy === "string"
        ? payload.endedBy
        : undefined;
  }

  if (event.eventType === "call_analysis_completed") {
    const payload = event.payload as CallAnalysisCompletedPayload;
    transitionPayload.callOutcome = payload.call_outcome;
    transitionPayload.confidence = safeFloat(payload.confidence);
    if (payload.duration_sec !== undefined) {
      transitionPayload.durationSec = safeFloat(payload.duration_sec);
    }

    await recordCallBillingTransaction({
      tenantId: event.tenantId,
      callId,
      callDurationSeconds: safeFloat(payload.duration_sec),
      callStatus: payload.status,
      callOutcome: payload.call_outcome,
      sourceEventId: event.eventId,
      transactionMetaJson: {
        source: "call_analysis_completed",
        lead: payload.lead,
        call_outcome: payload.call_outcome,
        confidence: payload.confidence,
      },
      db,
    });
  }

  if (event.eventType === "call_failed") {
    const payload = event.payload as CallFailedPayload;
    transitionPayload.failedAt = new Date(event.occurredAt);
    transitionPayload.lastError = `${payload.stage}: ${payload.error}`;
  }

  await updateCallSessionState({
    callId,
    tenantId: event.tenantId,
    state: nextState,
    ...transitionPayload,
    db,
  });
}

export async function processNormalizedVoiceEvent(event: NormalizedVoiceEvent): Promise<void> {
  assertUuid(event.tenantId, "tenantId");
  await upsertTenant({ tenantId: event.tenantId });

  logger.info("Voice webhook processing event", {
    eventId: event.eventId,
    eventType: event.eventType,
    callId: event.callId,
    tenantId: event.tenantId,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const callSession = await ensureCallSessionExists(event, tx);

      await createCallEvent({
        callId: callSession.id,
        tenantId: event.tenantId,
        eventType: event.eventType,
        occurredAt: new Date(event.occurredAt),
        eventId: event.eventId,
        payloadJson: toJsonValue(event.payload as VoiceEventPayload),
        rawEnvelope: toJsonValue(event.rawEnvelope),
        rawHeaders: toJsonValue(event.rawHeaders),
        db: tx,
      });

      await applyEventPayloadEffects({
        event,
        callSessionId: callSession.id,
        db: tx,
      });

      await applyStateTransition({
        event,
        callId: callSession.id,
        db: tx,
      });
    });
  } catch (error) {
    logger.error("Voice webhook DB transaction failed", {
      eventId: event.eventId,
      eventType: event.eventType,
      callId: event.callId,
      tenantId: event.tenantId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logger.info("Voice event persisted", {
    eventId: event.eventId,
    eventType: event.eventType,
    callId: event.callId,
    tenantId: event.tenantId,
  });

  publishRealtimeVoiceEvent(event);

  logger.info("Voice SSE event published", {
    eventId: event.eventId,
    eventType: event.eventType,
    callId: event.callId,
    tenantId: event.tenantId,
  });
}
