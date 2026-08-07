import { Request, Response, Router } from "express";

import { requireCapability } from "../../middleware/requireCapability";
import { requireTenant } from "../../middleware/requireTenant";
import { getCallById } from "../../services/callService";

const callDetailRouter = Router();

callDetailRouter.get(
  "/:callId",
  requireTenant,
  requireCapability("calls.history"),
  async (req: Request, res: Response) => {
    const callId = String(req.params.callId);
    const tenantId = req.requestContext?.tenantId as string;
    const call = await getCallById(callId, tenantId);

    if (!call) {
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
      data: call,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

export default callDetailRouter;
