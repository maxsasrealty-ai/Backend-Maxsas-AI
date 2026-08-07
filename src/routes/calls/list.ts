import { Request, Response, Router } from "express";

import { CallLifecycleStatus } from "../../generated/prisma";
import { requireCapability } from "../../middleware/requireCapability";
import { requireTenant } from "../../middleware/requireTenant";
import { listCalls } from "../../services/callService";

const listCallsRouter = Router();

listCallsRouter.get(
  "/",
  requireTenant,
  requireCapability("calls.history"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;

    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const status = typeof req.query.status === "string" ? (req.query.status as CallLifecycleStatus) : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

    const result = await listCalls({
      tenantId,
      page,
      pageSize,
      status,
      from,
      to,
    });

    res.status(200).json({
      success: true,
      data: result.items,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          page,
          pageSize,
          totalItems: result.totalItems,
          totalPages: Math.max(Math.ceil(result.totalItems / pageSize), 1),
        },
      },
    });
  }
);

export default listCallsRouter;
