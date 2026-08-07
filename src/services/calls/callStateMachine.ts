import { VoiceEventType } from "../../../shared/contracts/voice-events";
import { CallLifecycleStatus } from "../../generated/prisma";

/**
 * Valid state transitions for a call session.
 * Only forward transitions are allowed — a call cannot go backward.
 */
const transitionMap: Record<CallLifecycleStatus, CallLifecycleStatus[]> = {
  queued:      ["initiated", "dispatching", "ringing", "connected"],
  initiated:   ["dispatching", "ringing", "connected"],
  dispatching: ["ringing", "connected", "failed"],
  ringing:     ["connected", "failed"],
  connected:   ["active", "completed", "failed"],
  active:      ["completed", "failed"],
  completed:   [],
  failed:      [],
};

export function canTransition(from: CallLifecycleStatus, to: CallLifecycleStatus): boolean {
  return transitionMap[from].includes(to);
}

export function transitionOrStay(
  from: CallLifecycleStatus,
  to: CallLifecycleStatus
): CallLifecycleStatus {
  return canTransition(from, to) ? to : from;
}

/**
 * Maps a voice event type to the target call lifecycle status.
 * Returns null if the event doesn't drive a state change.
 *
 * Agent event order (normal call):
 *   call_started → call_ringing → call_connected → call_active
 *   → call_transcript_final → [lead_extracted] → call_analysis_completed → call_completed
 */
export function deriveStateFromEvent(eventType: VoiceEventType): CallLifecycleStatus | null {
  switch (eventType) {
    case "call_started":
      return "connected";         // Agent entered the room, SIP dialling started
    case "call_ringing":
      return "ringing";           // Waiting for callee to pick up
    case "call_connected":
      return "connected";         // Target participant joined
    case "call_active":
      return "active";            // Conversation is live, greeting queued
    case "call_transcript_final":
      return "active";            // Transcript arrived — still in active phase
    case "call_completed":
      return "completed";
    case "call_failed":
      return "failed";
    // These events don't change state:
    case "lead_extracted":
    case "call_analysis_completed":
    case "transcript_partial":    // legacy
    case "transcript_final":      // legacy
    case "publisher_test":
    case "agent_log":
    default:
      return null;
  }
}
