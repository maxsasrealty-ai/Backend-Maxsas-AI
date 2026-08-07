export type AdminLiveEventStage =
  | "received"
  | "invalid_json"
  | "validation_failed"
  | "persisted"
  | "duplicate"
  | "error";

import { computeLeadBucket } from "../../shared/leadOutcome";

export interface AdminLiveEvent {
  streamEventId: string;
  occurredAt: string;
  stage: AdminLiveEventStage;
  dbUpdated: boolean;
  eventId?: string;
  tenantId?: string;
  callId?: string;
  roomId?: string;
  eventType?: string;
  message?: string;
  rawBody?: unknown;
  normalizedBody?: unknown;
  // Normalized/raw outcome + derived bucket (computed on publish)
  raw_call_outcome?: string | null;
  lead_bucket?: string | null;
}

const listeners = new Set<(event: AdminLiveEvent) => void>();
const recentEvents: AdminLiveEvent[] = [];
const MAX_RECENT_EVENTS = 250;

export function subscribeAdminLiveEvents(onEvent: (event: AdminLiveEvent) => void): () => void {
  listeners.add(onEvent);
  return () => {
    listeners.delete(onEvent);
  };
}

export function publishAdminLiveEvent(event: Omit<AdminLiveEvent, "streamEventId" | "occurredAt">): void {
  const mapped: AdminLiveEvent = {
    streamEventId: `admin-live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    occurredAt: new Date().toISOString(),
    ...event,
  };

  // If normalizedBody contains a call outcome, compute derived lead bucket and expose both
  try {
    const nb = mapped.normalizedBody as any;
    let rawOutcome: string | null = null;
    if (nb && typeof nb === "object") {
      rawOutcome = (nb.call_outcome || nb.callOutcome || nb.outcome || null) as string | null;
    }
    if (!rawOutcome && mapped.rawBody && typeof mapped.rawBody === "object") {
      const rb = mapped.rawBody as any;
      rawOutcome = (rb.call_outcome || rb.callOutcome || rb.outcome || null) as string | null;
    }

    if (rawOutcome) {
      mapped.raw_call_outcome = rawOutcome;
      const bucket = computeLeadBucket(rawOutcome);
      mapped.lead_bucket = bucket ? String(bucket) : null;
    } else {
      mapped.raw_call_outcome = null;
      mapped.lead_bucket = null;
    }
  } catch (err) {
    mapped.raw_call_outcome = null;
    mapped.lead_bucket = null;
  }

  recentEvents.unshift(mapped);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.length = MAX_RECENT_EVENTS;
  }

  listeners.forEach((listener) => listener(mapped));
}

export function getRecentAdminLiveEvents(limit = 50): AdminLiveEvent[] {
  const safeLimit = Math.max(1, Math.min(200, limit));
  return recentEvents.slice(0, safeLimit);
}
