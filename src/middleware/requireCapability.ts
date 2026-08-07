import { NextFunction, Request, Response } from "express";

import { CapabilityKey } from "../../../shared/contracts";
import { getCachedTenantCapabilities, hasCapability } from "../services/accessService";

export function requireCapability(capability: CapabilityKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.requestContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: {
          code: "TENANT_REQUIRED",
          message: "Tenant context is required before capability checks",
        },
      });
      return;
    }

    const capabilityResult = await getCachedTenantCapabilities(tenantId);

    if (!hasCapability(capabilityResult.capabilities.plan, capability)) {
      res.status(403).json({
        success: false,
        error: {
          code: "FEATURE_NOT_AVAILABLE",
          message: `Capability ${capability} is not available for tenant plan ${capabilityResult.capabilities.plan}`,
        },
      });
      return;
    }

    next();
  };
}
