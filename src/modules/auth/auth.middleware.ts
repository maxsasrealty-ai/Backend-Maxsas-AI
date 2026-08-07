import { NextFunction, Request, Response } from "express";

import { getAuthContextFromAccessToken } from "./auth.service";
import { normalizeBearerToken } from "./auth.jwt";

function getBearerToken(req: Request): string {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  return authHeader.startsWith("Bearer ") ? normalizeBearerToken(authHeader) : "";
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing access token" } });
    return;
  }

  try {
    const auth = await getAuthContextFromAccessToken(token);
    req.auth = auth;
    if (req.requestContext && !req.requestContext.tenantId) {
      req.requestContext.tenantId = auth.tenantId;
    }
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Invalid access token" },
    });
  }
}

export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const auth = await getAuthContextFromAccessToken(token);
    req.auth = auth;
    if (req.requestContext && !req.requestContext.tenantId) {
      req.requestContext.tenantId = auth.tenantId;
    }
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Invalid access token" },
    });
  }
}

export async function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  await authMiddleware(req, res, () => {
    if (req.auth?.role !== "admin") {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required" } });
      return;
    }

    next();
  });
}

export async function tenantValidationMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tenantId = req.requestContext?.tenantId || req.auth?.tenantId;

  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: {
        code: "TENANT_REQUIRED",
        message: "Tenant context is required. Provide x-tenant-id header or authenticate first.",
      },
    });
    return;
  }

  if (req.auth && req.auth.tenantId !== tenantId) {
    res.status(403).json({
      success: false,
      error: {
        code: "TENANT_MISMATCH",
        message: "Authenticated tenant does not match x-tenant-id header",
      },
    });
    return;
  }

  if (req.requestContext && !req.requestContext.tenantId) {
    req.requestContext.tenantId = tenantId;
  }

  next();
}
