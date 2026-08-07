import { Request, Response, Router } from "express";

import { requireAuth } from "../../middleware/requireAuth";
import { requireCapability } from "../../middleware/requireCapability";
import { requireTenant } from "../../middleware/requireTenant";
import { getLeadByCallId } from "../../services/callService";

const leadRouter = Router();

leadRouter.get(
  "/:callId/lead",
  requireAuth,
  requireTenant,
  requireCapability("calls.history"),
  async (req: Request, res: Response) => {
    const callId = String(req.params.callId);
    const tenantId = req.requestContext?.tenantId as string;

    const result = await getLeadByCallId(callId, tenantId);
    if (!result) {
      res.status(404).json({
        success: false,
        error: {
          code: "LEAD_NOT_FOUND",
          message: `Lead extraction not found for call ${callId}`,
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

export default leadRouter;
