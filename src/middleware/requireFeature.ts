import { NextFunction, Request, Response } from "express";

import { getTenantById, upsertTenant } from "../repositories/tenantRepository";
import { enforceFeature, FeatureName, getTenantFeatures } from "../services/planFeatureService";

export function requireFeature(featureName: FeatureName, options?: { analyticsLevel?: "limited" | "full" }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.requestContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: {
          code: "TENANT_REQUIRED",
          message: "Tenant context is required",
        },
      });
      return;
    }

    const tenant = (await getTenantById(tenantId)) || (await upsertTenant({ tenantId, plan: "basic" }));

    try {
      const features = getTenantFeatures(tenant);
      enforceFeature(featureName, features, options);
      next();
    } catch {
      res.status(403).json({
        success: false,
        error: {
          code: "FEATURE_NOT_AVAILABLE",
          message: `Feature ${featureName} is not available for current tenant plan`,
        },
      });
    }
  };
}
