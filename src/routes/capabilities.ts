import { Request, Response, Router } from "express";

import { requireTenant } from "../middleware/requireTenant";
import { getCachedTenantCapabilities } from "../services/accessService";

const capabilitiesRouter = Router();

capabilitiesRouter.get("/", requireTenant, async (req: Request, res: Response) => {
  const tenantId = req.requestContext?.tenantId as string;
  const result = await getCachedTenantCapabilities(tenantId);

  res.status(200).json({
    success: true,
    data: {
      tenantId,
      capabilities: result.capabilities,
      workspaceConfig: result.workspaceConfig,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
      cacheHit: result.cacheHit,
    },
  });
});

export default capabilitiesRouter;
