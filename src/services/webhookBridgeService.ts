import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { voiceEventEnvelopeSchema } from "../modules/voice-events/voice-events.schema";
import { ingestVoiceEvent } from "../modules/voice-events/voice-events.service";
import { isWebhookBridgeActive } from "./backendControlService";

type BridgeEvent = {
  id: number;
  event_id?: string;
  event_type?: string;
  call_id?: string;
  room_id?: string;
  tenant_id?: string;
  occurred_at?: string;
  payload?: Record<string, unknown>;
};

type BridgeRecentResponse = {
  ok?: boolean;
  events?: BridgeEvent[];
  max_id?: number;
};

let sinceId = 0;
let isRunning = false;
let timer: NodeJS.Timeout | null = null;

const voiceEventTypeAliasMap: Record<string, string> = {
  // Preserve canonical event names from the agent.
  // Only keep minimal compatibility for legacy transcript partial naming.
  call_transcript_partial: "transcript_partial",
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRecentEvents(): Promise<BridgeEvent[]> {
  const sourceUrl = `${config.webhookBridgeSourceUrl}/api/voice/events/recent?since_id=${sinceId}&limit=100`;
  const response = await fetchWithTimeout(sourceUrl, { method: "GET" }, 8000);
  if (!response.ok) {
    throw new Error(`bridge fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as BridgeRecentResponse;
  if (!Array.isArray(body.events)) {
    return [];
  }

  return body.events;
}

async function bootstrapSinceIdFromLatest(): Promise<void> {
  const sourceUrl = `${config.webhookBridgeSourceUrl}/api/voice/events/recent?since_id=0&limit=1`;
  const response = await fetchWithTimeout(sourceUrl, { method: "GET" }, 8000);
  if (!response.ok) {
    throw new Error(`bridge bootstrap failed: ${response.status}`);
  }

  const body = (await response.json()) as BridgeRecentResponse;
  if (typeof body.max_id === "number" && Number.isFinite(body.max_id)) {
    sinceId = body.max_id;
  }
}

async function forwardEvent(event: BridgeEvent): Promise<boolean> {
  if (!event.event_id || !event.event_type || !event.call_id || !event.room_id || !event.tenant_id) {
    return false;
  }

  const normalizedEventType = voiceEventTypeAliasMap[event.event_type] || event.event_type;
  const payloadData = {
    ...(event.payload || {}),
  };

  if (normalizedEventType !== event.event_type && !payloadData.original_event_type) {
    payloadData.original_event_type = event.event_type;
  }

  const envelopeInput = {
    event_id: event.event_id,
    event_type: normalizedEventType,
    call_id: event.call_id,
    room_id: event.room_id,
    tenant_id: event.tenant_id,
    occurred_at: event.occurred_at || new Date().toISOString(),
    payload: payloadData,
  };

  const validation = voiceEventEnvelopeSchema.safeParse(envelopeInput);
  if (!validation.success) {
    logger.warn("Webhook bridge validation failed", {
      eventId: event.event_id,
      eventType: event.event_type,
      message: validation.error.issues.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
    });
    return false;
  }

  const result = await ingestVoiceEvent({
    eventId: event.event_id,
    headers: {
      "x-webhook-bridge": "true",
    },
    rawBody: envelopeInput,
    envelope: validation.data,
  });

  return result.accepted || result.reason === "DUPLICATE_EVENT_ID";
}

async function runSync(): Promise<void> {
  if (isRunning) {
    return;
  }

  if (!(await isWebhookBridgeActive())) {
    return;
  }

  isRunning = true;
  try {
    const events = await fetchRecentEvents();
    if (events.length === 0) {
      return;
    }

    const ordered = [...events].sort((a, b) => a.id - b.id);
    let forwardedCount = 0;

    for (const event of ordered) {
      try {
        const forwarded = await forwardEvent(event);
        if (forwarded) {
          forwardedCount += 1;
        }
      } catch (error) {
        logger.warn("Webhook bridge event forward failed", {
          eventId: event.event_id,
          eventType: event.event_type,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      sinceId = Math.max(sinceId, event.id);
    }

    if (forwardedCount > 0) {
      logger.info("Webhook bridge forwarded events", {
        forwardedCount,
        sinceId,
      });
    } else {
      logger.info("Webhook bridge found events but forwarded none", {
        checkedCount: ordered.length,
        sinceId,
      });
    }
  } catch (error) {
    logger.warn("Webhook bridge sync failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
}

export function startWebhookBridge(localBackendPort: number): void {
  if (config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects) {
    logger.info("Webhook bridge skipped in local safety mode", {
      sourceUrl: config.webhookBridgeSourceUrl,
      backendPort: localBackendPort,
    });
    return;
  }

  if (!config.isWebhookBridgeEnabled) {
    return;
  }

  if (!config.webhookAuthToken) {
    logger.warn("Webhook bridge disabled: webhook auth token not configured");
    return;
  }

  logger.info("Webhook bridge enabled", {
    sourceUrl: config.webhookBridgeSourceUrl,
    backendPort: localBackendPort,
    pollMs: config.webhookBridgePollMs,
  });

  bootstrapSinceIdFromLatest()
    .then(() => {
      logger.info("Webhook bridge bootstrapped from latest event", { sinceId });
    })
    .catch((error) => {
      logger.warn("Webhook bridge bootstrap failed; falling back to since_id=0", {
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      runSync().catch(() => {
        // Intentionally ignored; runSync logs internal errors.
      });

      timer = setInterval(() => {
        runSync().catch(() => {
          // Intentionally ignored; runSync logs internal errors.
        });
      }, config.webhookBridgePollMs);
    });

  process.on("SIGINT", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });
}
