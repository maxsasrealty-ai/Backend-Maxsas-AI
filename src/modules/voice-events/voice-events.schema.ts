import { z } from "zod";

/**
 * Source-verified event types from agent/event_publisher.py.
 * The agent sends exactly these types (in order for a normal call):
 *   call_started → call_ringing → call_connected → call_active
 *   → call_transcript_final → [lead_extracted] → call_analysis_completed → call_completed
 */
export const voiceEventTypeValues = [
  // ── Real agent events ───────────────────────────────────────────
  "call_started",
  "call_ringing",
  "call_connected",
  "call_active",
  "call_transcript_final",
  "lead_extracted",
  "call_analysis_completed",
  "call_completed",
  "call_failed",
  // ── Legacy / compatibility ──────────────────────────────────────
  // These were expected before but are NOT sent by the current agent
  "transcript_partial",
  "transcript_final",
  "publisher_test",
  "agent_log",
] as const;

export const voiceEventTypeSchema = z.enum(voiceEventTypeValues);

export const voiceEventEnvelopeSchema = z.object({
  event_type: voiceEventTypeSchema,
  tenant_id: z.string().min(1),
  call_id: z.string().min(1),
  room_id: z.string().min(1),
  occurred_at: z.string().datetime({ offset: true }).or(z.string().min(1)),
  payload: z.record(z.string(), z.unknown()).default({}),
  // event_id is optional in body (also comes in X-Event-Id header)
  event_id: z.string().optional(),
});

export type VoiceEventEnvelopeInput = z.infer<typeof voiceEventEnvelopeSchema>;
