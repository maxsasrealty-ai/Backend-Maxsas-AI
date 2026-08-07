export type CallEventStage =
  | "incoming_request"
  | "room_created"
  | "dispatch_attempt"
  | "dispatch_success"
  | "dispatch_failed"
  | "call_duration_limit_reached"
  | "webhook_received"
  | "sse_sent";

export type CallEventStatus = "pending" | "success" | "failed";

export interface CallEventEntry {
  stage: CallEventStage;
  status: CallEventStatus;
  ts: string;
  payload: unknown | null;
  error: unknown | null;
}

export interface CallEventRecord extends CallEventEntry {
  call_id: string;
  tenant_id?: string | null;
}

export interface EmitCallEventInput {
  call_id: string;
  tenant_id?: string | null;
  stage: CallEventStage;
  status: CallEventStatus;
  ts?: string;
  payload?: unknown;
  error?: unknown;
}

type CallEventListener = (event: CallEventRecord) => void;

const CALL_EVENT_STORE: Record<string, CallEventEntry[]> = Object.create(null);
const listeners = new Set<{ tenantId?: string; onEvent: CallEventListener }>();
const MAX_EVENTS_PER_CALL = 250;

function normalizeTs(ts?: string): string {
  if (!ts) {
    return new Date().toISOString();
  }

  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function storeCallEvent(event: CallEventRecord): void {
  const bucket = CALL_EVENT_STORE[event.call_id] || [];
  bucket.push({
    stage: event.stage,
    status: event.status,
    ts: event.ts,
    payload: event.payload ?? null,
    error: event.error ?? null,
  });

  if (bucket.length > MAX_EVENTS_PER_CALL) {
    bucket.splice(0, bucket.length - MAX_EVENTS_PER_CALL);
  }

  CALL_EVENT_STORE[event.call_id] = bucket;
}

export function emitCallEvent(input: EmitCallEventInput): void {
  if (!input.call_id || typeof input.call_id !== "string") {
    return;
  }

  const event: CallEventRecord = {
    call_id: input.call_id,
    tenant_id: input.tenant_id ?? null,
    stage: input.stage,
    status: input.status,
    ts: normalizeTs(input.ts),
    payload: input.payload ?? null,
    error: input.error ?? null,
  };

  storeCallEvent(event);

  listeners.forEach((listener) => {
    if (listener.tenantId && listener.tenantId !== event.tenant_id) {
      return;
    }

    try {
      listener.onEvent(event);
    } catch {
      // Listener cleanup is managed by the subscriber.
    }
  });
}

export function subscribeCallStepEvents(onEvent: CallEventListener, tenantId?: string): () => void {
  const listener = { tenantId, onEvent };
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getCallEvents(callId: string): CallEventEntry[] {
  return [...(CALL_EVENT_STORE[callId] || [])].sort((a, b) => {
    return new Date(a.ts).getTime() - new Date(b.ts).getTime();
  });
}

export function getCallEventsForKeys(callIds: string[]): CallEventEntry[] {
  const merged = callIds.flatMap((callId) => getCallEvents(callId));
  return merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}
