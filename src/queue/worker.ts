import { UnrecoverableError, Worker } from "bullmq";
import { Prisma } from "../generated/prisma";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { getOutboundQueueConcurrency } from "../services/backendControlService";
import { createCallSession, updateCallSessionState } from "../repositories/callRepository";
import {
    claimOutboundCallRequestForDispatch,
    getOutboundCallRequestById,
    markOutboundCallRequestDispatched,
} from "../repositories/outboundRequestRepository";
import { emitCallEvent } from "../services/callObservabilityService";
import { dispatchToTelephonyEngine, TelephonyError } from "../services/telephonyService";
import { OUTBOUND_CALL_QUEUE_NAME, redisConnection } from "./producer";


export interface OutboundCallJobData {
  requestId: string;
  tenantId: string;
}

type OutboundCallJob = {
  id?: string | number;
  data: OutboundCallJobData;
};

export async function processOutboundCallJob(job: OutboundCallJob) {
  const { requestId, tenantId } = job.data;
  const jobId = "id" in job ? job.id : undefined;

  const contextLog = {
    request_id: requestId,
    tenant_id: tenantId,
    job_id: jobId,
  };

  logger.info("Processing outbound call job", contextLog);

  const request = await getOutboundCallRequestById({ requestId, tenantId });
  if (!request) {
    logger.warn("Outbound call request not found", contextLog);
    return;
  }

  if (request.status === "dispatched") {
    logger.info("Outbound call already dispatched, skipping", {
      ...contextLog,
      current_status: request.status,
    });
    return;
  }

  const claimed = await claimOutboundCallRequestForDispatch({ requestId, tenantId });
  if (!claimed) {
    const current = await getOutboundCallRequestById({ requestId, tenantId });
    if (!current || current.status === "dispatched") {
      logger.info("Outbound call claim failed or already processed", {
        ...contextLog,
        claimed: !!claimed,
        current_status: current?.status,
      });
      return;
    }
  }

  logger.info("Outbound call request claimed for dispatch", {
    ...contextLog,
    phone: request.phoneNumber,
    agent_name: request.agentName,
    room_id: request.roomId,
  });

  const payload =
    request.payloadJson && typeof request.payloadJson === "object" && !Array.isArray(request.payloadJson)
      ? (request.payloadJson as Record<string, unknown>)
      : {};
  const voiceCalling =
    payload.voiceCalling && typeof payload.voiceCalling === "object" && !Array.isArray(payload.voiceCalling)
      ? (payload.voiceCalling as Record<string, unknown>)
      : {};

  try {
    await dispatchToTelephonyEngine({
      callId: requestId,
      tenantId,
      phoneNumber: request.phoneNumber,
      roomId: request.roomId,
      agentName: request.agentName,
      direction: "outbound",
      callDurationLimitEnabled: Boolean(voiceCalling.callDurationLimitEnabled),
      callDurationLimitSec:
        typeof voiceCalling.callDurationLimitSec === "number"
          ? voiceCalling.callDurationLimitSec
          : voiceCalling.callDurationLimitSec === null
            ? null
            : undefined,
    });

    logger.info("Dispatch to telephony engine succeeded", {
      ...contextLog,
      call_id: requestId,
      room_id: request.roomId,
    });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const callSession = await createCallSession({
        callId: requestId,
        tenantId,
        externalCallId: `livekit:${requestId}`,
        roomId: request.roomId,
        phoneNumber: request.phoneNumber,
        agentName: request.agentName,
        direction: "outbound",
        state: "dispatching",
        db: tx,
      });

      logger.info("Call session created", {
        ...contextLog,
        call_session_id: callSession.id,
        state: callSession.status,
      });

      await markOutboundCallRequestDispatched({
        requestId,
        tenantId,
        callSessionId: callSession.id,
        db: tx,
      });

      logger.info("Outbound call request marked dispatched", {
        ...contextLog,
        call_session_id: callSession.id,
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Outbound dispatch failed";
    const errorStage = error instanceof TelephonyError ? error.stage : "unknown";
    const isStaleTrunkError =
      errorMessage.includes("requested sip trunk does not exist") ||
      errorStage === "outbound_trunk_missing";
    
    logger.error("Outbound call dispatch failed", {
      ...contextLog,
      error_message: errorMessage,
      error_stage: errorStage,
      error_context: error instanceof TelephonyError ? error.context : {},
    });

    emitCallEvent({
      call_id: requestId,
      tenant_id: tenantId,
      stage: "dispatch_failed",
      status: "failed",
      payload: {
        room_id: request.roomId,
        agent_name: request.agentName,
        error_stage: errorStage,
      },
      error: errorMessage,
    });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const failedCallSession = await createCallSession({
        callId: requestId,
        tenantId,
        externalCallId: `livekit:${requestId}`,
        roomId: request.roomId,
        phoneNumber: request.phoneNumber,
        agentName: request.agentName,
        direction: "outbound",
        state: "failed",
        db: tx,
      });

      await updateCallSessionState({
        callId: failedCallSession.id,
        tenantId,
        state: "failed",
        failedAt: new Date(),
        lastError: `${errorStage}: ${errorMessage}`,
        db: tx,
      });

      await tx.outboundCallRequest.updateMany({
        where: {
          id: requestId,
          tenantId,
        },
        data: {
          status: "failed",
          errorMessage: `${errorStage}: ${errorMessage}`,
          callSessionId: failedCallSession.id,
        },
      });
    });

    if (isStaleTrunkError) {
      throw new UnrecoverableError(
        `Outbound SIP trunk is out of sync with LiveKit: ${errorMessage}`
      );
    }

    throw error;
  }
}

let outboundCallWorker: Worker<OutboundCallJobData> | null = null;

export async function startOutboundCallWorker() {
  if (outboundCallWorker) {
    return outboundCallWorker;
  }

  const runtimeProcess = (globalThis as Record<string, unknown>)["process"] as {
    env?: { REDIS_DISABLED?: string };
  } | undefined;
  const redisDisabled = runtimeProcess?.env?.REDIS_DISABLED === "true";

  if (redisDisabled || !redisConnection) {
    logger.warn("Outbound call worker disabled; using direct dispatch mode", {
      redis_disabled: redisDisabled,
      redis_connection_available: !!redisConnection,
    });
    return null;
  }

  const concurrency = await getOutboundQueueConcurrency();

  outboundCallWorker = new Worker<OutboundCallJobData>(OUTBOUND_CALL_QUEUE_NAME, processOutboundCallJob, {
    connection: redisConnection,
    concurrency,
    lockDuration: 30_000,
  });

  outboundCallWorker.on("completed", (job) => {
    logger.info("Outbound call job completed", {
      job_id: job.id,
      request_id: job.data.requestId,
      tenant_id: job.data.tenantId,
    });
  });

  outboundCallWorker.on("failed", (job, error) => {
    logger.error("Outbound call job failed after retries", {
      job_id: job?.id,
      request_id: job?.data?.requestId,
      tenant_id: job?.data?.tenantId,
      error_message: error.message,
      job_attempts: job?.attemptsMade,
    });
  });

  outboundCallWorker.on("error", (error) => {
    logger.warn("Outbound call worker Redis error", {
      error_message: error.message,
      error_code: (error as any).code,
    });
  });

  return outboundCallWorker;
}

export async function pauseOutboundCallWorker() {
  if (!outboundCallWorker) {
    return;
  }

  await outboundCallWorker.pause(false);
}

export async function resumeOutboundCallWorker() {
  if (!outboundCallWorker) {
    return;
  }

  await outboundCallWorker.resume();
}

export async function restartOutboundCallWorker() {
  if (outboundCallWorker) {
    await outboundCallWorker.close();
    outboundCallWorker = null;
  }

  return startOutboundCallWorker();
}
