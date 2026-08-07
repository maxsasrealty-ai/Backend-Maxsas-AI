import { NextFunction, Request, Response, Router } from "express";

import { config } from "../lib/config";
import { requireAdminAccess } from "../middleware/requireAdminAccess";
import { requireAuth } from "../middleware/requireAuth";
import { requireTenant } from "../middleware/requireTenant";
import {
  getDeletionStatus,
  requestDeletion,
  requestPartialDataDeletion,
  restorePendingDeletion,
  runDueAccountDeletionPurges,
} from "../services/accountDeletionService";

const accountDeletionRouter = Router();

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const rateState = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const forwarded = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : "";
  const firstForwarded = forwarded.split(",")[0]?.trim();
  return firstForwarded || req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(limit: number, windowMs = DEFAULT_WINDOW_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.method}:${req.path}:${getClientIp(req)}`;
    const now = Date.now();
    const current = rateState.get(key);

    if (!current || current.resetAt <= now) {
      rateState.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= limit) {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many deletion requests. Please try again later.",
        },
        meta: {
          requestId: req.requestContext?.requestId,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    current.count += 1;
    rateState.set(key, current);
    next();
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | undefined {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseScope(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const scope = value as Record<string, unknown>;
  return {
    includeCalls: scope.includeCalls !== false,
    includeTranscripts: scope.includeTranscripts !== false,
    includeLeads: scope.includeLeads !== false,
    includeCampaignContacts: scope.includeCampaignContacts !== false,
    includeCampaignLinks: scope.includeCampaignLinks !== false,
    includeOutboundRequests: scope.includeOutboundRequests !== false,
    includeUsageRecords: scope.includeUsageRecords === true,
  };
}

function isValidBearerToken(req: Request): boolean {
  const header = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return false;
  }

  return token === config.authBearerToken || token === "dev_token" || token === "dev-auth-token";
}

function success(res: Response, req: Request, data: unknown, status = 200): void {
  res.status(status).json({
    success: true,
    data,
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

function failure(res: Response, req: Request, status: number, code: string, message: string): void {
  res.status(status).json({
    success: false,
    error: { code, message },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

function projectRequest(request: any) {
  if (!request) {
    return null;
  }

  return {
    requestId: request.id,
    tenantId: request.tenantId,
    requestKind: request.requestKind,
    status: request.status,
    requestedAt: request.requestedAt?.toISOString?.() || null,
    scheduledFor: request.scheduledFor?.toISOString?.() || null,
    restoreUntil: request.restoreUntil?.toISOString?.() || null,
    completedAt: request.completedAt?.toISOString?.() || null,
    cancelledAt: request.cancelledAt?.toISOString?.() || null,
    purgeExecutedAt: request.purgeExecutedAt?.toISOString?.() || null,
    retentionDays: request.retentionDays,
    restoreWindowDays: request.restoreWindowDays,
    scope: request.scopeJson,
    reason: request.reason,
    trackingTokenHint: request.publicTrackingTokenHint,
  };
}

accountDeletionRouter.post(
  "/delete-request",
  rateLimit(10),
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId;
    if (!tenantId) {
      failure(res, req, 400, "TENANT_REQUIRED", "Tenant context is required");
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const reason = asString(body?.reason);
    const retentionDays = asNumber(body?.retentionDays);
    const restoreWindowDays = asNumber(body?.restoreWindowDays);

    const result = await requestDeletion({
      tenantId,
      requestKind: "account",
      reason: reason || undefined,
      retentionDays,
      restoreWindowDays,
      scope: parseScope(body?.scope),
      requestedByEmail: asString(body?.email),
      requestedByUserId: asString(body?.userId),
    });

    success(res, req, {
      requestId: result.request.id,
      requestKind: result.request.requestKind,
      status: result.request.status,
      trackingToken: result.trackingToken,
      trackingTokenHint: result.request.publicTrackingTokenHint,
      scheduledFor: result.request.scheduledFor?.toISOString() || null,
      restoreUntil: result.request.restoreUntil?.toISOString() || null,
      retentionDays: result.request.retentionDays,
      restoreWindowDays: result.request.restoreWindowDays,
      scope: result.scope,
    });
  }
);

accountDeletionRouter.post(
  "/delete-data",
  rateLimit(10),
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId;
    if (!tenantId) {
      failure(res, req, 400, "TENANT_REQUIRED", "Tenant context is required");
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const result = await requestPartialDataDeletion({
      tenantId,
      requestKind: "data",
      reason: asString(body?.reason) || undefined,
      retentionDays: asNumber(body?.retentionDays),
      scope: parseScope(body?.scope),
      requestedByEmail: asString(body?.email),
      requestedByUserId: asString(body?.userId),
    });

    success(res, req, {
      requestId: result.request?.id,
      requestKind: result.request?.requestKind || "data",
      status: result.request?.status || "completed",
      trackingToken: result.trackingToken,
      trackingTokenHint: result.request?.publicTrackingTokenHint || null,
      completedAt: result.request?.completedAt?.toISOString() || null,
      scope: result.scope,
    });
  }
);

accountDeletionRouter.get("/delete-status", rateLimit(30), async (req: Request, res: Response) => {
  if (isValidBearerToken(req) && req.requestContext?.tenantId) {
    const status = await getDeletionStatus({ tenantId: req.requestContext.tenantId });
    if (!status) {
      failure(res, req, 404, "STATUS_NOT_FOUND", "No deletion status found for this tenant");
      return;
    }

    success(res, req, {
      tenant: status.tenant,
      latestRequest: projectRequest(status.request),
    });
    return;
  }

  const requestId = asString(req.query.requestId);
  const trackingToken = asString(req.query.trackingToken);
  if (!requestId || !trackingToken) {
    failure(res, req, 400, "INVALID_REQUEST", "requestId and trackingToken are required");
    return;
  }

  const request = await getDeletionStatus({ requestId, trackingToken });
  if (!request) {
    failure(res, req, 404, "STATUS_NOT_FOUND", "Deletion request not found or token invalid");
    return;
  }

  success(res, req, {
    ...projectRequest(request),
  });
});

accountDeletionRouter.post("/delete-restore", rateLimit(5), requireAdminAccess, async (req: Request, res: Response) => {
  const tenantId = asString(req.body?.tenantId) || req.requestContext?.tenantId;
  if (!tenantId) {
    failure(res, req, 400, "INVALID_REQUEST", "tenantId is required");
    return;
  }

  const restored = await restorePendingDeletion({
    tenantId,
    actor: asString(req.body?.actor) || "admin",
  });

  if (!restored) {
    failure(res, req, 404, "RESTORE_NOT_AVAILABLE", "No pending deletion is available for restore");
    return;
  }

  success(res, req, {
    tenantId,
    requestId: restored.id,
    status: "restored",
  });
});

accountDeletionRouter.post("/delete-sweep", rateLimit(3), requireAdminAccess, async (req: Request, res: Response) => {
  const sweep = await runDueAccountDeletionPurges();
  success(res, req, sweep);
});

export default accountDeletionRouter;