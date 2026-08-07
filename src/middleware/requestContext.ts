import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

import { normalizeTenantId } from "../lib/tenant-id";

export function attachRequestContext(source: "api" | "webhook") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const requestId = String(req.headers["x-request-id"] || randomUUID());
    const tenantFromHeader = req.headers["x-tenant-id"];
    const tenantFromBody = typeof req.body?.tenant_id === "string" ? req.body.tenant_id : undefined;
    const rawTenantId = typeof tenantFromHeader === "string" ? tenantFromHeader : tenantFromBody;

    req.requestContext = {
      requestId,
      tenantId: rawTenantId ? normalizeTenantId(rawTenantId) : undefined,
      source,
    };

    next();
  };
}
