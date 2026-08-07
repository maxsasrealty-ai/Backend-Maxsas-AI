import { prisma } from "../../lib/db";
import { logger } from "../../lib/logger";
import { normalizeTenantId } from "../../lib/tenant-id";
import { recordCallBillingTransaction } from "../../repositories/callBillingRepository";
import { publishRealtimeVoiceEvent } from "../../services/realtimeService";
import { ensureTenant } from "../tenants/tenant.service";
import { armCallDurationLimitTimer, clearCallDurationLimitTimer } from "../../services/callDurationLimitService";
import { VoiceEventEnvelopeInput } from "./voice-events.schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeUnknown(input: unknown): string {
  return JSON.stringify(input ?? null);
}

function parseOptionalDateTime(input: unknown): Date | null {
  if (!input) return null;
  const parsed = new Date(String(input));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeString(v: unknown): string | undefined {
  return v && typeof v === "string" ? v : undefined;
}

function safeFloat(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function safeInt(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

// ─── Transcript bulk-insert helper ───────────────────────────────────────────

/**
 * Map speaker string from agent to our DB enum.
 * Agent sends: "agent" | "person". DB enum: user | agent | person.
 */
function mapSpeaker(raw: unknown): "user" | "agent" | "person" {
  const s = String(raw || "agent").toLowerCase();
  if (s === "agent") return "agent";
  if (s === "person" || s === "user" || s === "human") return "person";
  return "agent";
}

async function saveBatchTranscript(args: {
  tenantId: string;
  callId: string;
  turns: Array<{ speaker: unknown; text: unknown; sequenceNo: unknown }>;
  occurredAt: Date;
}) {
  const { tenantId, callId, turns, occurredAt } = args;
  if (!turns?.length) return;

  for (const turn of turns) {
    const seq = safeInt(turn.sequenceNo) ?? 0;
    const text = String(turn.text || "");
    const speaker = mapSpeaker(turn.speaker);

    await prisma.transcriptSegment.upsert({
      where: { callId_sequenceNo: { callId, sequenceNo: seq } },
      create: {
        callId,
        tenantId,
        speaker,
        text,
        sequenceNo: seq,
        occurredAt,
      },
      update: {
        speaker,
        text,
        occurredAt,
      },
    });
  }

  logger.info("[voice] Batch transcript saved", {
    tenantId,
    callId,
    turnCount: turns.length,
  });
}

// ─── Main ingest function ─────────────────────────────────────────────────────

export async function ingestVoiceEvent(args: {
  eventId: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: unknown;
  envelope: VoiceEventEnvelopeInput;
}) {
  const tenantId = normalizeTenantId(args.envelope.tenant_id);
  await ensureTenant(tenantId);

  const occurredAt = parseOptionalDateTime(args.envelope.occurred_at) ?? new Date();
  const payload = args.envelope.payload as Record<string, unknown>;

  // ── 1. Ensure call session row exists ────────────────────────────────────
  await prisma.callSession.upsert({
    where: { id: args.envelope.call_id },
    update: { tenantId, roomId: args.envelope.room_id },
    create: {
      id: args.envelope.call_id,
      tenantId,
      roomId: args.envelope.room_id,
      direction: "outbound",
      status: "initiated",
      initiatedAt: occurredAt,
    },
  });

  // ── 2. Persist the raw event (idempotent) ────────────────────────────────
  const eventInsertResult = await prisma.callEvent.createMany({
    data: {
      eventId: args.eventId,
      tenantId,
      callId: args.envelope.call_id,
      eventType: args.envelope.event_type,
      occurredAt,
      payloadJson: serializeUnknown(payload),
      rawEnvelope: serializeUnknown(args.rawBody),
      rawHeaders: serializeUnknown(args.headers),
      normalizedJson: serializeUnknown({
        callId: args.envelope.call_id,
        tenantId,
        roomId: args.envelope.room_id,
        eventType: args.envelope.event_type,
      }),
    },
    skipDuplicates: true,
  });

  if (eventInsertResult.count === 0) {
    logger.info("[voice] Duplicate event skipped", {
      eventId: args.eventId,
      eventType: args.envelope.event_type,
    });
    return { accepted: false, reason: "DUPLICATE_EVENT_ID" };
  }

  // ── 3. Per-event business logic ──────────────────────────────────────────

  const et = args.envelope.event_type;

  // call_started → status: connected, capture phone/agent/direction
  if (et === "call_started") {
    const updateResult = await prisma.callSession.updateMany({
      where: {
        id: args.envelope.call_id,
        status: { in: ["queued", "initiated", "dispatching", "ringing", "connected"] },
      },
      data: {
        status: "connected",
        connectedAt: occurredAt,
        phoneNumber: safeString(payload.phone_number),
        agentName: safeString(payload.agent_name),
        direction: safeString(payload.direction),
      },
    });
    if (updateResult.count > 0) {
      logger.info("[voice] call_started → status=connected", { callId: args.envelope.call_id });
    } else {
      logger.info("[voice] call_started ignored (stale transition)", { callId: args.envelope.call_id });
    }
  }

  // call_ringing → status: ringing
  if (et === "call_ringing") {
    const updateResult = await prisma.callSession.updateMany({
      where: {
        id: args.envelope.call_id,
        status: { in: ["queued", "initiated", "dispatching", "ringing"] },
      },
      data: { status: "ringing" },
    });
    if (updateResult.count > 0) {
      logger.info("[voice] call_ringing → status=ringing", { callId: args.envelope.call_id });
    } else {
      logger.info("[voice] call_ringing ignored (stale transition)", { callId: args.envelope.call_id });
    }
  }

  // call_connected → status: connected, capture participant_identity
  if (et === "call_connected") {
    const updateResult = await prisma.callSession.updateMany({
      where: {
        id: args.envelope.call_id,
        status: { in: ["queued", "initiated", "dispatching", "ringing", "connected"] },
      },
      data: {
        status: "connected",
        connectedAt: occurredAt,
        // Capture phone/agent/direction in case call_started was missed
        phoneNumber: safeString(payload.phone_number),
        agentName: safeString(payload.agent_name),
        direction: safeString(payload.direction),
      },
    });
    if (updateResult.count > 0) {
      logger.info("[voice] call_connected → status=connected", { callId: args.envelope.call_id });
    } else {
      logger.info("[voice] call_connected ignored (stale transition)", { callId: args.envelope.call_id });
    }
  }

  // call_active → status: active (conversation started, greeting queued)
  if (et === "call_active") {
    const updateResult = await prisma.callSession.updateMany({
      where: {
        id: args.envelope.call_id,
        status: { in: ["queued", "initiated", "dispatching", "ringing", "connected", "active"] },
      },
      data: { status: "active" },
    });
    if (updateResult.count > 0) {
      logger.info("[voice] call_active → status=active", { callId: args.envelope.call_id });
    } else {
      logger.info("[voice] call_active ignored (stale transition)", { callId: args.envelope.call_id });
    }
  }

  // call_transcript_final — batch insert all turns
  if (et === "call_transcript_final") {
    const turns = Array.isArray(payload.turns)
      ? (payload.turns as Array<{ speaker: unknown; text: unknown; sequenceNo: unknown }>)
      : [];

    await saveBatchTranscript({
      tenantId,
      callId: args.envelope.call_id,
      turns,
      occurredAt,
    });

    // Update session turn count
    const turnCount = safeInt(payload.transcript_turns) ?? turns.length;
    if (turnCount > 0) {
      await prisma.callSession.update({
        where: { id: args.envelope.call_id },
        data: { transcriptTurns: turnCount },
      });
    }
  }

  // lead_extracted — from agent's structured lead analysis
  // NOTE: payload uses preferred_location, budget_range (NOT location/budget)
  if (et === "lead_extracted") {
    const confidence = payload.confidence as Record<string, unknown> | null;
    const confidenceOverall = confidence ? safeFloat(confidence.overall) : undefined;

    const updateData: any = {
      extractedAt: occurredAt,
      rawJson: serializeUnknown({
        source: "lead_extracted",
        payload,
      }),
    };

    // Only include confidence if not null
    if (confidenceOverall != null) updateData.confidence = confidenceOverall;

    // Only include fields that are not null/undefined
    if (payload.property_type != null) updateData.propertyType = safeString(payload.property_type);
    if (payload.preferred_location != null) updateData.preferredLocation = safeString(payload.preferred_location);
    if (payload.budget_range != null) updateData.budgetRange = safeString(payload.budget_range);
    if (payload.purchase_timeline != null) updateData.timeline = safeString(payload.purchase_timeline);

    await prisma.leadExtraction.upsert({
      where: { callId: args.envelope.call_id },
      create: {
        callId: args.envelope.call_id,
        tenantId,
        extractedAt: occurredAt,
        confidence: confidenceOverall,
        propertyType: safeString(payload.property_type),
        preferredLocation: safeString(payload.preferred_location),
        budgetRange: safeString(payload.budget_range),
        timeline: safeString(payload.purchase_timeline),
        rawJson: serializeUnknown({
          source: "lead_extracted",
          payload,
        }),
      },
      update: updateData,
    });

    logger.info("[voice] lead_extracted saved", {
      callId: args.envelope.call_id,
      tenantId,
      confidence: confidenceOverall,
      propertyType: payload.property_type,
    });
  }

  // call_analysis_completed — the definitive CRM record with call_outcome
  // This is ALWAYS sent (unlike lead_extracted which may be absent)
  if (et === "call_analysis_completed") {
    const callOutcome = safeString(payload.call_outcome);
    const confidence = safeFloat(payload.confidence);
    const durationSec = safeFloat(payload.duration_sec);
    const lead = (payload.lead && typeof payload.lead === "object")
      ? payload.lead as Record<string, unknown>
      : null;

    // Update call session with outcome and confidence
    await prisma.callSession.update({
      where: { id: args.envelope.call_id },
      data: {
        callOutcome,
        confidence,
        ...(durationSec !== undefined ? { durationSec: Math.round(durationSec) } : {}),
      },
    });

    // Upsert lead with the normalised fields from call_analysis_completed.lead
    // NOTE: in this event, the location field is named "location" (normalised from preferred_location)
    // Only update fields that are not null/undefined to avoid overwriting good data with nulls
    if (lead) {
      const updateData: any = {
        extractedAt: occurredAt,
        confidence,
        rawJson: serializeUnknown({
          source: "call_analysis_completed",
          lead,
          call_outcome: callOutcome,
        }),
      };


      // Only include fields that are not null/undefined
      if (lead.property_type != null) updateData.propertyType = safeString(lead.property_type);
      if (lead.location != null) updateData.preferredLocation = safeString(lead.location);
      if (lead.budget != null) updateData.budgetRange = safeString(lead.budget);
      if (lead.timeline != null) updateData.timeline = safeString(lead.timeline);

      await prisma.leadExtraction.upsert({
        where: { callId: args.envelope.call_id },
        create: {
          callId: args.envelope.call_id,
          tenantId,
          extractedAt: occurredAt,
          confidence,
          propertyType: safeString(lead.property_type),
          preferredLocation: safeString(lead.location),
          budgetRange: safeString(lead.budget),
          timeline: safeString(lead.timeline),
          rawJson: serializeUnknown({
            source: "call_analysis_completed",
            lead,
            call_outcome: callOutcome,
          }),
        },
        update: updateData,
      });
    }

    await recordCallBillingTransaction({
      tenantId,
      callId: args.envelope.call_id,
      callDurationSeconds: durationSec,
      callStatus: payload.status,
      callOutcome,
      sourceEventId: args.eventId,
      transactionMetaJson: {
        source: "call_analysis_completed",
        lead,
        call_outcome: callOutcome,
        confidence,
      },
    });

    logger.info("[voice] call_analysis_completed saved", {
      callId: args.envelope.call_id,
      tenantId,
      callOutcome,
      confidence,
    });
  }

  // call_completed — final event in normal flow
  if (et === "call_completed") {
    const durationSec = safeFloat(payload.duration_sec);
    const transcriptTurns = safeInt(payload.transcript_turns);
    const endedBy = safeString(payload.ended_by);

    const updateResult = await prisma.callSession.updateMany({
      where: {
        id: args.envelope.call_id,
        status: { in: ["queued", "initiated", "dispatching", "ringing", "connected", "active"] },
      },
      data: {
        status: "completed",
        completedAt: occurredAt,
        ...(durationSec !== undefined ? { durationSec: Math.round(durationSec) } : {}),
        ...(transcriptTurns !== undefined ? { transcriptTurns } : {}),
        ...(endedBy ? { endedBy } : {}),
        // recording_url is always null from this agent — don't set it
      },
    });

    if (updateResult.count > 0) {
      await recordCallBillingTransaction({
        tenantId,
        callId: args.envelope.call_id,
        callDurationSeconds: durationSec,
        callStatus: "completed",
        callOutcome: endedBy,
        sourceEventId: args.eventId,
        transactionMetaJson: {
          source: "call_completed",
          transcript_turns: transcriptTurns,
          ended_by: endedBy,
          duration_sec: durationSec,
        },
      });

      logger.info("[voice] call_completed → status=completed", {
        callId: args.envelope.call_id,
        tenantId,
        endedBy,
        durationSec,
      });
    } else {
      logger.info("[voice] call_completed ignored (already terminal)", {
        callId: args.envelope.call_id,
        tenantId,
      });
    }
  }

  // call_failed — replaces call_completed on unhandled exception
  if (et === "call_failed") {
    const updateResult = await prisma.callSession.updateMany({
      where: {
        id: args.envelope.call_id,
        status: { in: ["queued", "initiated", "dispatching", "ringing", "connected", "active"] },
      },
      data: {
        status: "failed",
        failedAt: occurredAt,
        lastError: `${payload.stage ?? "unknown"}: ${payload.error ?? "unknown call failure"}`,
      },
    });
    if (updateResult.count > 0) {
      logger.info("[voice] call_failed → status=failed", {
        callId: args.envelope.call_id,
        tenantId,
        stage: payload.stage,
        error: payload.error,
      });
    } else {
      logger.info("[voice] call_failed ignored (already terminal)", {
        callId: args.envelope.call_id,
        tenantId,
      });
    }
  }

  if (et === "call_active") {
    await armCallDurationLimitTimer({
      callId: args.envelope.call_id,
      tenantId,
      roomId: args.envelope.room_id,
    });
  }

  if (et === "call_completed" || et === "call_failed") {
    clearCallDurationLimitTimer(args.envelope.call_id);
  }

  // Legacy events (transcript_partial / transcript_final) — ignore gracefully
  if (et === "transcript_partial" || et === "transcript_final") {
    logger.warn("[voice] Received legacy transcript event — agent should send call_transcript_final", {
      eventType: et,
      callId: args.envelope.call_id,
    });
  }

  // ── 4. Publish realtime SSE event ─────────────────────────────────────────
  publishRealtimeVoiceEvent({
    eventId: args.eventId,
    tenantId,
    callId: args.envelope.call_id,
    roomId: args.envelope.room_id,
    eventType: args.envelope.event_type,
    occurredAt: args.envelope.occurred_at,
    payload,
    rawEnvelope: args.rawBody,
    rawHeaders: args.headers,
  });

  logger.info(`[REALTIME] published for callId=${args.envelope.call_id}`, {
    eventId: args.eventId,
    tenantId,
    eventType: args.envelope.event_type,
  });

  return { accepted: true };
}

// ─── Agent log ingest ─────────────────────────────────────────────────────────

export async function ingestAgentLog(args: {
  eventId: string;
  tenantId: string;
  callId: string;
  roomId: string;
  level?: string;
  message: string;
  meta?: unknown;
  occurredAt?: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: unknown;
}) {
  const tenantId = normalizeTenantId(args.tenantId);
  await ensureTenant(tenantId);

  const occurredAt = parseOptionalDateTime(args.occurredAt) ?? new Date();

  await prisma.callSession.upsert({
    where: { id: args.callId },
    update: { tenantId, roomId: args.roomId },
    create: {
      id: args.callId,
      tenantId,
      roomId: args.roomId,
      direction: "outbound",
      status: "initiated",
      initiatedAt: occurredAt,
    },
  });

  const agentLogInsertResult = await prisma.callEvent.createMany({
    data: {
      eventId: args.eventId,
      tenantId,
      callId: args.callId,
      eventType: "agent_log",
      occurredAt,
      payloadJson: serializeUnknown({
        level: args.level || "info",
        message: args.message,
        meta: args.meta ?? null,
      }),
      rawEnvelope: serializeUnknown(args.rawBody),
      rawHeaders: serializeUnknown(args.headers),
      normalizedJson: serializeUnknown({
        tenantId,
        callId: args.callId,
        roomId: args.roomId,
        level: args.level || "info",
        message: args.message,
      }),
    },
    skipDuplicates: true,
  });

  if (agentLogInsertResult.count === 0) {
    return { accepted: false, reason: "DUPLICATE_EVENT_ID" };
  }

  logger.info("Agent log event accepted", {
    eventId: args.eventId,
    tenantId,
    callId: args.callId,
  });

  return { accepted: true };
}
