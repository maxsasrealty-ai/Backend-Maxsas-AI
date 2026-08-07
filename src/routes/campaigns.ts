import { Request, Response, Router } from "express";

import { CampaignStatus, CreateCampaignInput, UpdateCampaignInput } from "../../../shared/contracts";
import { requireCapability } from "../middleware/requireCapability";
import { requireTenant } from "../middleware/requireTenant";
import {
    createTenantCampaign,
    deleteTenantCampaign,
    getCampaignCallsForTenant,
    getCampaignContactsForTenant,
    getCampaignWorkspaceMeta,
    getTenantCampaign,
    listTenantCampaigns,
    updateTenantCampaign,
} from "../services/campaignService";

const campaignsRouter = Router();
const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "queued", "active", "completed", "archived"];

function parseCampaignStatus(input: unknown): CampaignStatus | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  if ((CAMPAIGN_STATUSES as string[]).includes(input)) {
    return input as CampaignStatus;
  }

  return undefined;
}

campaignsRouter.post(
  "/",
  requireTenant,
  requireCapability("calls.live"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;
    const body = req.body as Partial<CreateCampaignInput>;
    const status = parseCampaignStatus(body.status);

    if (!body.name || !body.name.trim()) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Campaign name is required",
        },
      });
      return;
    }

    if (body.status && !status) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: `Invalid status. Expected one of: ${CAMPAIGN_STATUSES.join(", ")}`,
        },
      });
      return;
    }

    const campaign = await createTenantCampaign(tenantId, {
      name: body.name.trim(),
      description: body.description,
      status,
      callIds: body.callIds,
      contacts: body.contacts,
    });

    const workspace = await getCampaignWorkspaceMeta(tenantId);

    res.status(201).json({
      success: true,
      data: campaign,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        workspace,
      },
    });
  }
);

campaignsRouter.get(
  "/",
  requireTenant,
  requireCapability("calls.history"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const status = parseCampaignStatus(rawStatus);

    if (rawStatus && !status) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: `Invalid status. Expected one of: ${CAMPAIGN_STATUSES.join(", ")}`,
        },
      });
      return;
    }

    const result = await listTenantCampaigns({
      tenantId,
      page,
      pageSize,
      status,
    });

    const workspace = await getCampaignWorkspaceMeta(tenantId);

    res.status(200).json({
      success: true,
      data: result.items,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        workspace,
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

campaignsRouter.get(
  "/:id",
  requireTenant,
  requireCapability("calls.history"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;
    const campaignId = String(req.params.id);

    const campaign = await getTenantCampaign(campaignId, tenantId);
    if (!campaign) {
      res.status(404).json({
        success: false,
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: `Campaign ${campaignId} was not found for tenant ${tenantId}`,
        },
      });
      return;
    }

    const workspace = await getCampaignWorkspaceMeta(tenantId);

    res.status(200).json({
      success: true,
      data: campaign,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        workspace,
      },
    });
  }
);

campaignsRouter.patch(
  "/:id",
  requireTenant,
  requireCapability("calls.live"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;
    const campaignId = String(req.params.id);
    const body = req.body as UpdateCampaignInput;
    const status = parseCampaignStatus(body.status);

    if (body.status && !status) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: `Invalid status. Expected one of: ${CAMPAIGN_STATUSES.join(", ")}`,
        },
      });
      return;
    }

    const campaign = await updateTenantCampaign(campaignId, tenantId, {
      ...body,
      status,
    });
    if (!campaign) {
      res.status(404).json({
        success: false,
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: `Campaign ${campaignId} was not found for tenant ${tenantId}`,
        },
      });
      return;
    }

    const workspace = await getCampaignWorkspaceMeta(tenantId);

    res.status(200).json({
      success: true,
      data: campaign,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        workspace,
      },
    });
  }
);

campaignsRouter.delete(
  "/:id",
  requireTenant,
  requireCapability("calls.live"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;
    const campaignId = String(req.params.id);

    const deleted = await deleteTenantCampaign(campaignId, tenantId);
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: `Campaign ${campaignId} was not found for tenant ${tenantId}`,
        },
      });
      return;
    }

    const workspace = await getCampaignWorkspaceMeta(tenantId);

    res.status(200).json({
      success: true,
      data: {
        id: campaignId,
        deleted: true,
      },
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        workspace,
      },
    });
  }
);

campaignsRouter.get(
  "/:id/calls",
  requireTenant,
  requireCapability("calls.history"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;
    const campaignId = String(req.params.id);

    const items = await getCampaignCallsForTenant(campaignId, tenantId);
    if (!items) {
      res.status(404).json({
        success: false,
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: `Campaign ${campaignId} was not found for tenant ${tenantId}`,
        },
      });
      return;
    }

    const workspace = await getCampaignWorkspaceMeta(tenantId);

    res.status(200).json({
      success: true,
      data: items,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        workspace,
      },
    });
  }
);

campaignsRouter.get(
  "/:id/contacts",
  requireTenant,
  requireCapability("calls.history"),
  async (req: Request, res: Response) => {
    const tenantId = req.requestContext?.tenantId as string;
    const campaignId = String(req.params.id);

    const items = await getCampaignContactsForTenant(campaignId, tenantId);
    if (!items) {
      res.status(404).json({
        success: false,
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: `Campaign ${campaignId} was not found for tenant ${tenantId}`,
        },
      });
      return;
    }

    const workspace = await getCampaignWorkspaceMeta(tenantId);

    res.status(200).json({
      success: true,
      data: items,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
        workspace,
      },
    });
  }
);

export default campaignsRouter;
