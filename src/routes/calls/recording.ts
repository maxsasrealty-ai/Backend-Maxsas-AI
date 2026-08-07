import { Request, Response, Router } from "express";

import { requireAuth } from "../../middleware/requireAuth";
import { requireCapability } from "../../middleware/requireCapability";
import { requireTenant } from "../../middleware/requireTenant";
import { getRecordingMetadata } from "../../services/callService";

const recordingRouter = Router();

recordingRouter.get(
  "/:callId/recording",
  requireAuth,
  requireTenant,
  requireCapability("recordings.playback"),
  async (req: Request, res: Response) => {
    const callId = String(req.params.callId);
    const tenantId = req.requestContext?.tenantId as string;

    const result = await getRecordingMetadata(callId, tenantId);
    if (!result) {
      res.status(404).json({
        success: false,
        error: {
          code: "CALL_NOT_FOUND",
          message: `Call ${callId} was not found for tenant ${tenantId}`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

export default recordingRouter;
