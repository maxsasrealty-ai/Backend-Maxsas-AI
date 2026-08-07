import { Request, Response, Router } from "express";

import { InitiateCallRequest } from "../../../shared/contracts";
import { normalizePhoneNumber } from "../../lib/config";
import { logger } from "../../lib/logger";
import { captureIncomingCallRequest } from "../../middleware/callObservability";
import { requireAuth } from "../../middleware/requireAuth";
import { requireCapability } from "../../middleware/requireCapability";
import { requireTenant } from "../../middleware/requireTenant";
import { emitCallEvent } from "../../services/callObservabilityService";
import { initiateCallSession } from "../../services/callService";

const createCallRouter = Router();

createCallRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requireCapability("calls.live"),
  captureIncomingCallRequest,
  async (req: Request, res: Response) => {
    const requestId = req.requestContext?.requestId;
    const tenantId = req.requestContext?.tenantId as string;
    const body = req.body as Partial<InitiateCallRequest>;

    const contextLog = {
      request_id: requestId,
      tenant_id: tenantId,
      room_id: body.roomId,
      phone_number: body.phoneNumber,
      agent_name: body.agentName,
      voice_calling: body.voiceCalling,
    };

    logger.info("Incoming POST /api/calls", contextLog);

    // Validate request payload
    if (!body.roomId || !body.agentName || !body.direction || !body.phoneNumber) {
      logger.warn("Request validation failed", {
        ...contextLog,
        missing_fields: [
          !body.roomId && "roomId",
          !body.agentName && "agentName",
          !body.direction && "direction",
          !body.phoneNumber && "phoneNumber",
        ].filter(Boolean),
      });
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "roomId, phoneNumber, agentName and direction are required",
        },
      });
      return;
    }

    try {
      const normalizedPhoneNumber = normalizePhoneNumber(body.phoneNumber);

      const created = await initiateCallSession({
        tenantId,
        roomId: body.roomId,
        phoneNumber: normalizedPhoneNumber,
        agentName: body.agentName,
        direction: body.direction,
        voiceCalling: body.voiceCalling,
        callDurationLimitEnabled: body.callDurationLimitEnabled,
        callDurationLimitSec: body.callDurationLimitSec,
      });

      logger.info("Call session accepted", {
        ...contextLog,
        call_id: created.callId,
        state: created.state,
      });

      emitCallEvent({
        call_id: created.callId,
        tenant_id: tenantId,
        stage: "incoming_request",
        status: "success",
        ts: res.locals.callObservability?.capturedAt,
        payload: res.locals.callObservability ?? {
          route: `${req.method} ${req.originalUrl}`,
          headers: { "x-tenant-id": tenantId },
          body,
          requestId,
        },
      });

      res.status(201).json({
        success: true,
        data: created,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      if (errorMsg.includes("callDurationLimitSec")) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: errorMsg,
          },
        });
        return;
      }

      logger.error("Call initiation handler failed", {
        ...contextLog,
        error_message: errorMsg,
        error_type: (err as any)?.name || "Error",
      });
      
      res.status(500).json({
        success: false,
        error: {
          code: "CALL_INITIATION_FAILED",
          message: errorMsg,
        },
      });
    }
  }
);

export default createCallRouter;
