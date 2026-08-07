import { Request, Response, Router } from "express";

import { requireFeature } from "../../middleware/requireFeature";
import { requireTenant } from "../../middleware/requireTenant";

const enterpriseAnalyticsRouter = Router();

enterpriseAnalyticsRouter.get(
	"/",
	requireTenant,
	requireFeature("analytics", { analyticsLevel: "full" }),
	async (req: Request, res: Response) => {
		res.status(200).json({
			success: true,
			data: {
				analytics: "full",
			},
			meta: {
				requestId: req.requestContext?.requestId,
				timestamp: new Date().toISOString(),
			},
		});
	}
);

export default enterpriseAnalyticsRouter;

