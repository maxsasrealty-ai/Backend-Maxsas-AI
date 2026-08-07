import { Request, Response, Router } from "express";

import { CALL_DURATION_LIMIT_OPTIONS } from "../../shared/contracts/plans";
import { requireAuth } from "../middleware/requireAuth";
import { requireTenant } from "../middleware/requireTenant";
import { invalidateTenantCapabilityCache, normalizeWorkspaceConfig } from "../services/accessService";
import { PlanKey } from "../../../shared/contracts/plans";
import { getPlanCapabilities, getWorkspaceConfigForPlan } from "../services/accessService";
import { getTenantById, upsertTenant } from "../repositories/tenantRepository";

const accessRouter = Router();

function respondAccessCapabilities(req: Request, res: Response): void {
  const rawPlan = String(req.query.plan || "basic").toLowerCase();
  const plan = (["basic", "pro", "enterprise"].includes(rawPlan)
    ? rawPlan
    : "basic") as PlanKey;

  if (plan === "enterprise") {
    const configuredKey = process.env.ADMIN_API_KEY || "dev-admin-key";

    if (process.env.APP_ENV === "production" && !process.env.ADMIN_API_KEY) {
      res.status(500).json({
        success: false,
        error: {
          code: "ADMIN_KEY_NOT_CONFIGURED",
          message: "ADMIN_API_KEY must be configured in production",
        },
      });
      return;
    }

    const headerKey = typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"] : null;
    const queryKey = typeof req.query.adminKey === "string" ? req.query.adminKey : null;
    const bearerToken = typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : null;
    const suppliedKey = headerKey || bearerToken || queryKey;

    if (!suppliedKey || suppliedKey !== configuredKey) {
      res.status(403).json({
        success: false,
        error: {
          code: "ENTERPRISE_ADMIN_ONLY",
          message: "Enterprise plan access is admin-controlled",
        },
      });
      return;
    }
  }

  const capabilities = getPlanCapabilities(plan);
  const workspaceConfig = getWorkspaceConfigForPlan(plan);

  res.status(200).json({
    success: true,
    data: {
      capabilities,
      workspaceConfig,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

accessRouter.get("/", respondAccessCapabilities);
accessRouter.get("/capabilities", respondAccessCapabilities);

accessRouter.patch("/voice-calling", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const tenantId = req.requestContext?.tenantId as string;
  const body = req.body as {
    callDurationLimitEnabled?: unknown;
    callDurationLimitSec?: unknown;
  };

  const enabled = typeof body.callDurationLimitEnabled === "boolean"
    ? body.callDurationLimitEnabled
    : String(body.callDurationLimitEnabled || "").toLowerCase() === "true";

  const rawLimit = body.callDurationLimitSec;
  const parsedLimit = rawLimit === null || typeof rawLimit === "undefined" || rawLimit === ""
    ? null
    : Number(rawLimit);

  if (enabled && parsedLimit !== null && !CALL_DURATION_LIMIT_OPTIONS.includes(parsedLimit as (typeof CALL_DURATION_LIMIT_OPTIONS)[number])) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: `callDurationLimitSec must be one of ${CALL_DURATION_LIMIT_OPTIONS.join(", ")} seconds`,
      },
    });
    return;
  }

  const tenant = await getTenantById(tenantId);
  const currentConfig = normalizeWorkspaceConfig({
    ...(tenant?.workspaceConfigJson && typeof tenant.workspaceConfigJson === "object" && !Array.isArray(tenant.workspaceConfigJson)
      ? (tenant.workspaceConfigJson as Record<string, unknown>)
      : {}),
  });

  const nextConfig = normalizeWorkspaceConfig({
    ...currentConfig,
    voiceCalling: {
      ...currentConfig.voiceCalling,
      callDurationLimitEnabled: enabled,
      callDurationLimitSec: enabled ? (parsedLimit as (typeof CALL_DURATION_LIMIT_OPTIONS)[number] | null) : null,
    },
    tenantControl: {
      ...(currentConfig as Record<string, unknown>).tenantControl,
      voiceCalling: {
        ...(((currentConfig as Record<string, unknown>).tenantControl as Record<string, unknown> | undefined)?.voiceCalling as Record<string, unknown> | undefined),
        callDurationLimitEnabled: enabled,
        callDurationLimitSec: enabled ? (parsedLimit as (typeof CALL_DURATION_LIMIT_OPTIONS)[number] | null) : null,
      },
    },
  });

  await upsertTenant({
    tenantId,
    workspaceConfigJson: nextConfig as unknown as import("../generated/prisma").Prisma.InputJsonValue,
  });
  invalidateTenantCapabilityCache(tenantId);

  res.status(200).json({
    success: true,
    data: {
      tenantId,
      voiceCalling: nextConfig.voiceCalling,
      workspaceConfig: nextConfig,
    },
    meta: {
      requestId: req.requestContext?.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

export default accessRouter;
