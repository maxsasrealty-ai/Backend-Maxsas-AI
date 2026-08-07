import { Request, Response, Router } from "express";

import { VoiceEventEnvelope } from "../../../../shared/contracts/voice-events";
import { attachRequestContext } from "../../middleware/requestContext";
import { verifyWebhookAuth } from "../../middleware/verifyWebhookAuth";
import { emitCallEvent } from "../../services/callObservabilityService";
import {
    markEventAsProcessing,
    normalizeVoiceEvent,
    processNormalizedVoiceEvent,
    validateVoiceEventEnvelope,
} from "../../services/voiceEventService";

const voiceWebhookRouter = Router();

function parseWebhookBody(body: unknown): unknown {
  if (!Buffer.isBuffer(body)) {
    return body;
  }

  const rawBody = body.toString("utf-8");
  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    return "invalid_json";
  }
}

voiceWebhookRouter.post(
  "/events",
  verifyWebhookAuth,
  attachRequestContext("webhook"),
  async (req: Request, res: Response) => {
    const parsedBody = parseWebhookBody(req.body);

    if (parsedBody === "invalid_json") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON_BODY",
          message: "Webhook body is not valid JSON",
        },
      });
      return;
    }

    const body = parsedBody as Record<string, unknown>;
    const bodyCallId = String(body.call_id || body.callId || "");
    const bodyOccurredAt = String(body.occurred_at || body.occurredAt || new Date().toISOString());
    
    const eventId = String(req.headers["x-event-id"] || body.event_id || body.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const callIdFromHeader = String(req.headers["x-call-id"] || bodyCallId);
    const occurredAtHeader = String(req.headers["x-occurred-at"] || bodyOccurredAt);

    if (!callIdFromHeader) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_CALL_IDENTITY",
          message: "x-call-id header or payload call_id is required",
        },
      });
      return;
    }

    const validation = validateVoiceEventEnvelope(body);

    if (!validation.isValid) {
      emitCallEvent({
        call_id: callIdFromHeader,
        tenant_id: typeof body.tenant_id === "string" ? body.tenant_id : null,
        stage: "webhook_received",
        status: "failed",
        payload: {
          route: `${req.method} ${req.originalUrl}`,
          event_id: eventId,
          raw_body: body,
        },
        error: validation.errors,
      });

      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_EVENT_ENVELOPE",
          message: "Voice event payload is invalid",
          details: validation.errors,
        },
      });
      return;
    }

    const envelope = body as unknown as VoiceEventEnvelope;

    emitCallEvent({
      call_id: envelope.call_id,
      tenant_id: envelope.tenant_id,
      stage: "webhook_received",
      status: "success",
      payload: {
        route: `${req.method} ${req.originalUrl}`,
        event_id: eventId,
        event_type: envelope.event_type,
        room_id: envelope.room_id,
        payload: envelope.payload,
      },
    });

    console.info("[WEBHOOK] voice event accepted", {
      eventId,
      eventType: envelope.event_type,
      callId: envelope.call_id,
      tenantId: envelope.tenant_id,
    });

    const idempotency = await markEventAsProcessing({
      tenantId: envelope.tenant_id,
      eventId,
      callId: envelope.call_id,
      eventType: envelope.event_type,
      occurredAt: envelope.occurred_at,
    });
    if (!idempotency.accepted) {
      res.status(202).json({
        success: true,
        data: {
          accepted: false,
          reason: idempotency.reason,
        },
      });
      return;
    }

    const normalized = normalizeVoiceEvent({
      envelope,
      headers: {
        eventId,
        callId: callIdFromHeader,
        occurredAt: occurredAtHeader,
      },
      rawEnvelope: req.body,
      rawHeaders: req.headers,
    });

    console.info("[WEBHOOK] voice event normalized", {
      eventId: normalized.eventId,
      eventType: normalized.eventType,
      callId: normalized.callId,
      tenantId: normalized.tenantId,
    });

    await processNormalizedVoiceEvent(normalized);

    res.status(202).json({
      success: true,
      data: {
        accepted: true,
        eventId,
        tenantId: envelope.tenant_id,
        callId: envelope.call_id,
      },
    });
  }
);

export default voiceWebhookRouter;
