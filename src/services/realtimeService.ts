import { CallState, LiveCallStage, RealtimeCallEvent } from "../../shared/contracts";
import { CampaignRealtimeEvent } from "../../shared/contracts/campaigns";
import { NormalizedVoiceEvent } from "../../shared/contracts/voice-events";
import { publishAdminLiveEvent } from "./adminLiveEventsService";
import { emitCallEvent } from "./callObservabilityService";

const listenersByTenant = new Map<string, Set<(event: RealtimeCallEvent) => void>>();
const campaignListenersByTenant = new Map<string, Set<(event: CampaignRealtimeEvent) => void>>();

function stateFromVoiceEvent(eventType: NormalizedVoiceEvent["eventType"]): CallState {
  switch (eventType) {
    case "call_started":
    case "call_ringing":
    case "call_connected":
      return "connected";
    case "call_active":
    case "call_transcript_final":
    case "transcript_partial":
    case "transcript_final":
      return "active";
    case "call_completed":
      return "completed";
    case "call_failed":
      return "failed";
    case "lead_extracted":
    case "call_analysis_completed":
    default:
      return "active";
  }
}

function stageFromVoiceEvent(event: NormalizedVoiceEvent): LiveCallStage {
  switch (event.eventType) {
    case "call_started":
    case "call_ringing":
      return "connecting";
    case "call_connected":
    case "call_active":
      return "in_progress";
    case "call_transcript_final":
      return "transcript_final";
    case "transcript_partial":
      return "transcript_partial";
    case "transcript_final":
      return "transcript_final";
    case "lead_extracted":
      return "lead_extraction_updating";
    case "call_analysis_completed":
      return "analysis_pending";
    case "call_completed":
      return "analysis_pending";
    case "call_failed":
      return "failed";
    default:
      return "in_progress";
  }
}

export function subscribeRealtimeEvents(
  tenantId: string,
  onEvent: (event: RealtimeCallEvent) => void
): () => void {
  const listeners = listenersByTenant.get(tenantId) || new Set<(event: RealtimeCallEvent) => void>();
  listeners.add(onEvent);
  listenersByTenant.set(tenantId, listeners);

  return () => {
    const current = listenersByTenant.get(tenantId);
    if (!current) {
      return;
    }

    current.delete(onEvent);
    if (current.size === 0) {
      listenersByTenant.delete(tenantId);
    }
  };
}

export function publishRealtimeVoiceEvent(event: NormalizedVoiceEvent): void {
  const listeners = listenersByTenant.get(event.tenantId);

  const mapped: RealtimeCallEvent = {
    streamEventId: event.eventId,
    tenantId: event.tenantId,
    callId: event.callId,
    roomId: event.roomId,
    occurredAt: event.occurredAt,
    eventType: event.eventType,
    callState: stateFromVoiceEvent(event.eventType),
    stage: stageFromVoiceEvent(event),
    payload: event.payload,
  };

  publishAdminLiveEvent({
    stage: "persisted",
    dbUpdated: true,
    eventId: mapped.streamEventId,
    tenantId: mapped.tenantId,
    callId: mapped.callId,
    roomId: mapped.roomId,
    eventType: mapped.eventType,
    normalizedBody: mapped.payload,
  });

  emitCallEvent({
    call_id: mapped.callId,
    tenant_id: mapped.tenantId,
    stage: "sse_sent",
    status: "success",
    payload: {
      event: "call_event",
      stream_event_id: mapped.streamEventId,
      event_type: mapped.eventType,
      listener_count: listeners?.size || 0,
    },
  });

  if (!listeners || listeners.size === 0) {
    return;
  }

  listeners.forEach((listener) => {
    listener(mapped);
  });
}

export function subscribeCampaignRealtimeEvents(
  tenantId: string,
  onEvent: (event: CampaignRealtimeEvent) => void
): () => void {
  const listeners = campaignListenersByTenant.get(tenantId) || new Set<(event: CampaignRealtimeEvent) => void>();
  listeners.add(onEvent);
  campaignListenersByTenant.set(tenantId, listeners);

  return () => {
    const current = campaignListenersByTenant.get(tenantId);
    if (!current) {
      return;
    }

    current.delete(onEvent);
    if (current.size === 0) {
      campaignListenersByTenant.delete(tenantId);
    }
  };
}

export function publishCampaignRealtimeEvent(args: {
  tenantId: string;
  campaignId: string;
  eventType: CampaignRealtimeEvent["eventType"];
  payload: Record<string, unknown>;
}): void {
  const listeners = campaignListenersByTenant.get(args.tenantId);
  if (!listeners || listeners.size === 0) {
    return;
  }

  const event: CampaignRealtimeEvent = {
    streamEventId: `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    tenantId: args.tenantId,
    campaignId: args.campaignId,
    eventType: args.eventType,
    occurredAt: new Date().toISOString(),
    payload: args.payload,
  };

  listeners.forEach((listener) => {
    listener(event);
  });
}
