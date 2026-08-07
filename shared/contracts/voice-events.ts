/**
 * Voice event contracts — source-verified against agent/event_publisher.py
 * 
 * Event order (normal call):
 *   call_started → call_ringing → call_connected → call_active
 *   → call_transcript_final → [lead_extracted] → call_analysis_completed → call_completed
 *
 * Failure path:
 *   call_failed (replaces call_completed, sent on unhandled exception)
 */

// ─── Event Type Union ────────────────────────────────────────────────────────

export type VoiceEventType =
  | "call_started"
  | "call_ringing"
  | "call_connected"
  | "call_active"
  | "call_transcript_final"
  | "lead_extracted"
  | "call_analysis_completed"
  | "call_completed"
  | "call_failed"
  // Legacy — not sent by current agent but kept for backward compat
  | "transcript_partial"
  | "transcript_final"
  | "publisher_test"
  | "agent_log";

// ─── HTTP Headers (sent on every request) ───────────────────────────────────

export interface VoiceEventHeaders {
  /** UUID v4 — unique per event */
  eventId: string;
  /** call_id from job metadata */
  callId: string;
  /** ISO-8601 UTC timestamp */
  occurredAt: string;
}

// ─── Envelope (top-level — identical for all events) ────────────────────────

export interface VoiceEventEnvelope {
  /** UUID v4 — unique per event (also in X-Event-Id header) */
  event_id?: string;
  event_type: VoiceEventType;
  /** UUID from env DEFAULT_TENANT_ID */
  tenant_id: string;
  /** From job metadata or uuid4() */
  call_id: string;
  /** LiveKit room.name */
  room_id: string;
  /** ISO-8601 UTC, generated at send time */
  occurred_at: string;
  payload: VoiceEventPayload;
}

// ─── Payload Types Per Event ─────────────────────────────────────────────────

/** call_started — always the first event */
export interface CallStartedPayload {
  phone_number: string | null;
  agent_name: string;
  direction: "outbound" | "inbound";
  /** Always exactly "started" */
  status: "started";
}

/** call_ringing — outbound SIP only */
export interface CallRingingPayload {
  status: "call_ringing";
  direction: "outbound" | "inbound";
  agent_name: string;
  phone_number?: string;
}

/** call_connected — target participant joined room */
export interface CallConnectedPayload {
  status: "call_connected";
  direction: "outbound" | "inbound";
  agent_name: string;
  phone_number?: string;
  /** LiveKit participant identity string */
  participant_identity?: string;
}

/** call_active — session started, first greeting queued */
export interface CallActivePayload {
  status: "call_active";
  direction: "outbound" | "inbound";
  agent_name: string;
  phone_number?: string;
}

/** One turn in call_transcript_final */
export interface TranscriptTurn {
  /** "agent" | "person" (NOT "user") */
  speaker: "agent" | "person";
  text: string;
  /** 1-indexed, monotonically increasing */
  sequenceNo: number;
}

/** call_transcript_final — full conversation, sent after call ends */
export interface CallTranscriptFinalPayload {
  turns: TranscriptTurn[];
  /** Total count — same as turns.length */
  transcript_turns: number;
}

/** lead_extracted — only sent if at least 1 lead field extractable */
export interface LeadExtractedPayload {
  property_type: "apartment" | "plot" | "villa" | "commercial" | "unknown";
  /** Named preferred_location in this event */
  preferred_location: string;
  budget_range: string;
  purchase_timeline: "1-3 months" | "3-6 months" | "long_term" | "unknown";
  confidence: {
    overall: number;
    threshold: number;
    attempt: number;
  };
}

/** Normalized lead fields from call_analysis_completed.lead */
export interface AnalysisLeadFields {
  property_type: string | null;
  /** Named "location" here (normalised from preferred_location) */
  location: string | null;
  budget: string | null;
  timeline: "short_term" | "long_term" | "unknown" | null;
}

export type CallOutcomeLabel =
  | "call_failed"
  | "busy_line"
  | "invalid_number"
  | "voicemail_detected"
  | "user_no_response"
  | "wrong_person"
  | "not_available_callback_requested"
  | "not_interested"
  | "already_purchased"
  | "budget_not_decided"
  | "timeline_long_term"
  | "details_requested"
  | "advisor_callback_scheduled"
  | "qualified_lead_buy"
  | "site_visit_scheduled";

/** call_analysis_completed — always sent, contains final CRM record */
export interface CallAnalysisCompletedPayload {
  call_id: string;
  started_at: string;
  duration_sec: number;
  status: "completed";
  lead: AnalysisLeadFields;
  /** CRM outcome label */
  call_outcome: string;
  confidence: number;
}

export type EndedByReason =
  | "participant_disconnected"
  | "shutdown_signal"
  | "max_duration_timeout"
  | "not_interested"
  | "do_not_call"
  | "explicit_not_interested"
  | "abusive_end"
  | "callback_rejected"
  | "callback_requested"
  | "no_response_end"
  | "wrong_person";

/** call_completed — always the last event in a normal flow */
export interface CallCompletedPayload {
  status: "completed";
  ended_by: string;
  duration_sec: number;
  transcript_turns: number;
  /** Always null — LiveKit doesn't provide recording URLs */
  recording_url: null;
}

/** call_failed — replaces call_completed on unhandled exception */
export interface CallFailedPayload {
  status: "failed";
  error: string;
  stage: string;
  retryable: boolean;
}

// Legacy payload types (not sent by current agent)
export interface TranscriptEventPayload {
  speaker: "user" | "agent";
  text: string;
  final: boolean;
  sequence_no: number;
  provider_message_id?: string;
  raw?: unknown;
}

export type VoiceEventPayload =
  | CallStartedPayload
  | CallRingingPayload
  | CallConnectedPayload
  | CallActivePayload
  | CallTranscriptFinalPayload
  | LeadExtractedPayload
  | CallAnalysisCompletedPayload
  | CallCompletedPayload
  | CallFailedPayload
  | TranscriptEventPayload
  | Record<string, unknown>;

// ─── Normalized event (internal representation after parsing) ────────────────

export interface NormalizedVoiceEvent {
  eventId: string;
  eventType: VoiceEventType;
  tenantId: string;
  callId: string;
  roomId: string;
  occurredAt: string;
  payload: VoiceEventPayload;
  rawEnvelope: unknown;
  rawHeaders: Record<string, string | string[] | undefined>;
}
