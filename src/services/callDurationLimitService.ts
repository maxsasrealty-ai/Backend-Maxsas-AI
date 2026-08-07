import { RoomServiceClient } from "livekit-server-sdk";

import { CALL_DURATION_LIMIT_OPTIONS } from "../../shared/contracts/plans";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { getCallSessionById, updateCallSessionState } from "../repositories/callRepository";
import { getOutboundCallRequestById } from "../repositories/outboundRequestRepository";
import { normalizeRequestedCallDurationLimitConfig } from "./accessService";
import { emitCallEvent } from "./callObservabilityService";

const activeTimers = new Map<string, NodeJS.Timeout>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractRequestedDurationConfig(payloadJson: unknown) {
  if (!isRecord(payloadJson)) {
    return null;
  }

  const voiceCalling = isRecord(payloadJson.voiceCalling) ? payloadJson.voiceCalling : payloadJson;

  try {
    return normalizeRequestedCallDurationLimitConfig(voiceCalling);
  } catch (error) {
    logger.warn("[voice] Unable to parse call duration limit from outbound payload", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function clearCallDurationLimitTimer(callId: string): void {
  const timer = activeTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(callId);
  }
}

async function persistTimeoutCompletion(args: {
  callId: string;
  tenantId: string;
  durationSec: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await updateCallSessionState({
      callId: args.callId,
      tenantId: args.tenantId,
      state: "completed",
      completedAt: new Date(),
      durationSec: args.durationSec,
      endedBy: "max_duration_timeout",
      db: tx,
    });
  });
}

async function enforceCallDurationLimit(args: {
  callId: string;
  tenantId: string;
  roomId: string;
  durationSec: number;
}): Promise<void> {
  clearCallDurationLimitTimer(args.callId);

  const call = await getCallSessionById(args.callId, args.tenantId);
  if (!call || !["queued", "initiated", "dispatching", "ringing", "connected", "active"].includes(call.status)) {
    return;
  }

  emitCallEvent({
    call_id: args.callId,
    tenant_id: args.tenantId,
    stage: "call_duration_limit_reached",
    status: "success",
    payload: {
      room_id: args.roomId,
      duration_sec: args.durationSec,
      ended_by: "max_duration_timeout",
    },
  });

  if (config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects) {
    await persistTimeoutCompletion({
      callId: args.callId,
      tenantId: args.tenantId,
      durationSec: args.durationSec,
    });

    logger.info("[voice] call_duration_limit_reached simulated completion", {
      callId: args.callId,
      tenantId: args.tenantId,
      durationSec: args.durationSec,
    });
    return;
  }

  try {
    const roomClient = new RoomServiceClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
    await roomClient.removeParticipant(args.roomId, `sip-${args.callId}`);
  } catch (error) {
    logger.warn("[voice] failed to disconnect call at duration limit", {
      callId: args.callId,
      tenantId: args.tenantId,
      roomId: args.roomId,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  await persistTimeoutCompletion({
    callId: args.callId,
    tenantId: args.tenantId,
    durationSec: args.durationSec,
  });

  logger.info("[voice] call_duration_limit_reached enforced", {
    callId: args.callId,
    tenantId: args.tenantId,
    roomId: args.roomId,
    durationSec: args.durationSec,
  });
}

export async function armCallDurationLimitTimer(args: {
  callId: string;
  tenantId: string;
  roomId: string;
}): Promise<void> {
  clearCallDurationLimitTimer(args.callId);

  const request = await getOutboundCallRequestById({ requestId: args.callId, tenantId: args.tenantId });
  if (!request) {
    return;
  }

  const normalized = extractRequestedDurationConfig(request.payloadJson);
  if (!normalized?.callDurationLimitEnabled) {
    return;
  }

  const durationSec = normalized.callDurationLimitSec ?? CALL_DURATION_LIMIT_OPTIONS[0];
  const timer = setTimeout(() => {
    void enforceCallDurationLimit({
      callId: args.callId,
      tenantId: args.tenantId,
      roomId: args.roomId,
      durationSec,
    });
  }, durationSec * 1000);

  activeTimers.set(args.callId, timer);

  logger.info("[voice] armed call duration limit timer", {
    callId: args.callId,
    tenantId: args.tenantId,
    roomId: args.roomId,
    durationSec,
  });
}