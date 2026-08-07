import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { verifyWebhookAuth } from "../../middleware/verifyWebhookAuth";
import { publishAdminLiveEvent } from "../../services/adminLiveEventsService";
import { voiceEventEnvelopeSchema } from "./voice-events.schema";
import { ingestAgentLog, ingestVoiceEvent } from "./voice-events.service";

const voiceEventsRouter = Router();

async function writeVoiceIngestAudit(args: {
  level?: string;
  message?: string;
  eventType?: string;
  callId?: string;
  tenantId?: string;
  payload?: unknown;
  source?: string;
}): Promise<void> {
  try {
    await prisma.voiceIngestAudit.create({
      data: {
        level: args.level || null,
        message: args.message || null,
        eventType: args.eventType || null,
        callId: args.callId || null,
        tenantId: args.tenantId || null,
        payloadJson: (args.payload ?? null) as any,
        source: args.source || "voice_events_router",
      },
    });
  } catch (error) {
    publishAdminLiveEvent({
      stage: "error",
      dbUpdated: false,
      message: `voice_ingest_audit write failed: ${error instanceof Error ? error.message : String(error)}`,
      normalizedBody: {
        eventType: args.eventType,
        callId: args.callId,
        tenantId: args.tenantId,
      },
    });
  }
}

const agentLogSchema = z.object({
  tenant_id: z.string().min(1),
  call_id: z.string().min(1),
  room_id: z.string().min(1),
  level: z.string().min(1).optional(),
  message: z.string().min(1),
  occurred_at: z.string().optional(),
  meta: z.unknown().optional(),
});

/**
 * No event type aliases — agent sends canonical names directly.
 * Previous aliases were wrong and caused data loss:
 *   call_transcript_final → "transcript_final"   ❌ (different payload shape)
 *   call_active → "call_connected"               ❌ (wrong state)
 *   call_analysis_completed → "lead_extracted"   ❌ (completely different data)
 */

voiceEventsRouter.post("/voice/events", verifyWebhookAuth, async (req, res) => {
  const rawBody = typeof req.rawBody === "string"
    ? req.rawBody
    : Buffer.isBuffer(req.body)
      ? req.body.toString("utf-8")
      : "";

  let parsedBody: unknown = req.body;
  if (Buffer.isBuffer(req.body)) {
    try {
      parsedBody = JSON.parse(rawBody || "{}");
    } catch {
      publishAdminLiveEvent({
        stage: "invalid_json",
        dbUpdated: false,
        message: "Voice webhook body is not valid JSON",
        rawBody,
      });
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON_BODY",
          message: "Webhook body is not valid JSON",
        },
      });
      return;
    }
  }

  // Use X-Event-Id header, or event_id from body, or generate a fallback
  const eventId = String(
    req.headers["x-event-id"] ||
    (parsedBody as Record<string, unknown>)?.event_id ||
    `evt_${Date.now()}`
  );

  publishAdminLiveEvent({
    stage: "received",
    dbUpdated: false,
    eventId,
    tenantId: typeof (parsedBody as Record<string, unknown>)?.tenant_id === "string" ? String((parsedBody as Record<string, unknown>).tenant_id) : undefined,
    callId: typeof (parsedBody as Record<string, unknown>)?.call_id === "string" ? String((parsedBody as Record<string, unknown>).call_id) : undefined,
    roomId: typeof (parsedBody as Record<string, unknown>)?.room_id === "string" ? String((parsedBody as Record<string, unknown>).room_id) : undefined,
    eventType: typeof (parsedBody as Record<string, unknown>)?.event_type === "string" ? String((parsedBody as Record<string, unknown>).event_type) : undefined,
    rawBody: parsedBody,
    normalizedBody: parsedBody,
  });

  await writeVoiceIngestAudit({
    level: "info",
    message: "voice webhook received",
    eventType: typeof (parsedBody as Record<string, unknown>)?.event_type === "string" ? String((parsedBody as Record<string, unknown>).event_type) : undefined,
    callId: typeof (parsedBody as Record<string, unknown>)?.call_id === "string" ? String((parsedBody as Record<string, unknown>).call_id) : undefined,
    tenantId: typeof (parsedBody as Record<string, unknown>)?.tenant_id === "string" ? String((parsedBody as Record<string, unknown>).tenant_id) : undefined,
    payload: parsedBody,
  });

  const validation = voiceEventEnvelopeSchema.safeParse(parsedBody);



  if (!validation.success) {
    await writeVoiceIngestAudit({
      level: "warn",
      message: "voice webhook validation failed",
      eventType: typeof (parsedBody as Record<string, unknown>)?.event_type === "string" ? String((parsedBody as Record<string, unknown>).event_type) : undefined,
      callId: typeof (parsedBody as Record<string, unknown>)?.call_id === "string" ? String((parsedBody as Record<string, unknown>).call_id) : undefined,
      tenantId: typeof (parsedBody as Record<string, unknown>)?.tenant_id === "string" ? String((parsedBody as Record<string, unknown>).tenant_id) : undefined,
      payload: {
        raw: parsedBody,
        issues: validation.error.issues,
      },
    });

    publishAdminLiveEvent({
      stage: "validation_failed",
      dbUpdated: false,
      eventId,
      rawBody: parsedBody,
      normalizedBody: parsedBody,
      message: validation.error.issues.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
    });
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_VOICE_EVENT",
        message: validation.error.issues.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
      },
    });
    return;
  }

  try {
    const result = await ingestVoiceEvent({
      eventId,
      headers: req.headers,
      rawBody: parsedBody,
      envelope: validation.data,
    });

    publishAdminLiveEvent({
      stage: result.accepted ? "persisted" : "duplicate",
      dbUpdated: result.accepted,
      eventId,
      tenantId: validation.data.tenant_id,
      callId: validation.data.call_id,
      roomId: validation.data.room_id,
      eventType: validation.data.event_type,
      rawBody: parsedBody,
      normalizedBody: validation.data,
    });

    await writeVoiceIngestAudit({
      level: result.accepted ? "info" : "warn",
      message: result.accepted ? "voice webhook persisted" : `voice webhook not persisted: ${result.reason || "unknown"}`,
      eventType: validation.data.event_type,
      callId: validation.data.call_id,
      tenantId: validation.data.tenant_id,
      payload: {
        eventId,
        result,
      },
      source: "voice_events_router",
    });

    res.status(result.accepted ? 202 : 200).json({
      success: true,
      data: {
        eventId,
        ...result,
      },
    });
  } catch (error) {
    await writeVoiceIngestAudit({
      level: "error",
      message: error instanceof Error ? error.message : "Failed to ingest voice event",
      eventType: typeof (parsedBody as Record<string, unknown>)?.event_type === "string" ? String((parsedBody as Record<string, unknown>).event_type) : undefined,
      callId: typeof (parsedBody as Record<string, unknown>)?.call_id === "string" ? String((parsedBody as Record<string, unknown>).call_id) : undefined,
      tenantId: typeof (parsedBody as Record<string, unknown>)?.tenant_id === "string" ? String((parsedBody as Record<string, unknown>).tenant_id) : undefined,
      payload: {
        eventId,
        raw: parsedBody,
      },
    });

    publishAdminLiveEvent({
      stage: "error",
      dbUpdated: false,
      eventId,
      rawBody: parsedBody,
      normalizedBody: parsedBody,
      message: error instanceof Error ? error.message : "Failed to ingest voice event",
    });
    throw error;
  }
});

voiceEventsRouter.post("/voice/agent-logs", verifyWebhookAuth, async (req, res) => {
  const rawBody = typeof req.rawBody === "string"
    ? req.rawBody
    : Buffer.isBuffer(req.body)
      ? req.body.toString("utf-8")
      : "";

  let parsedBody: unknown = req.body;
  if (Buffer.isBuffer(req.body)) {
    try {
      parsedBody = JSON.parse(rawBody || "{}");
    } catch {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON_BODY",
          message: "Agent log payload is not valid JSON",
        },
      });
      return;
    }
  }

  const eventId = String(req.headers["x-event-id"] || `agent_evt_${Date.now()}`);
  const validation = agentLogSchema.safeParse(parsedBody);
  if (!validation.success) {
    publishAdminLiveEvent({
      stage: "validation_failed",
      dbUpdated: false,
      eventId,
      tenantId: typeof (parsedBody as Record<string, unknown>)?.tenant_id === "string" ? String((parsedBody as Record<string, unknown>).tenant_id) : undefined,
      callId: typeof (parsedBody as Record<string, unknown>)?.call_id === "string" ? String((parsedBody as Record<string, unknown>).call_id) : undefined,
      roomId: typeof (parsedBody as Record<string, unknown>)?.room_id === "string" ? String((parsedBody as Record<string, unknown>).room_id) : undefined,
      rawBody: parsedBody,
      normalizedBody: parsedBody,
      message: validation.error.issues.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
    });
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_AGENT_LOG_PAYLOAD",
        message: validation.error.issues.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
      },
    });
    return;
  }

  try {
    const result = await ingestAgentLog({
      eventId,
      tenantId: validation.data.tenant_id,
      callId: validation.data.call_id,
      roomId: validation.data.room_id,
      level: validation.data.level,
      message: validation.data.message,
      meta: validation.data.meta,
      occurredAt: validation.data.occurred_at,
      headers: req.headers,
      rawBody: parsedBody,
    });

    publishAdminLiveEvent({
      stage: result.accepted ? "persisted" : "duplicate",
      dbUpdated: result.accepted,
      eventId,
      tenantId: validation.data.tenant_id,
      callId: validation.data.call_id,
      roomId: validation.data.room_id,
      eventType: "agent_log",
      rawBody: parsedBody,
      normalizedBody: validation.data,
    });

    res.status(result.accepted ? 202 : 200).json({
      success: true,
      data: {
        eventId,
        ...result,
      },
    });
  } catch (error) {
    publishAdminLiveEvent({
      stage: "error",
      dbUpdated: false,
      eventId,
      rawBody: parsedBody,
      normalizedBody: parsedBody,
      message: error instanceof Error ? error.message : "Failed to ingest agent log",
    });
    throw error;
  }
});

export default voiceEventsRouter;
