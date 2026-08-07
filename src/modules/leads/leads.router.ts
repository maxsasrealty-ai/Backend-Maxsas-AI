import { Router } from "express";

import { LeadUploadPreviewRequest, ManualLeadPreviewRequest } from "../../../../shared/contracts";
import { requireCapability } from "../../middleware/requireCapability";
import { requireTenant } from "../../middleware/requireTenant";
import {
    generateLeadUploadPreview,
    generateManualLeadPreview,
    getLeadById,
    listLeads,
} from "./leads.service";

const leadsRouter = Router();

leadsRouter.get("/", requireTenant, async (req, res) => {
  const tenantId = req.requestContext?.tenantId as string;
  const leads = await listLeads(tenantId);
  res.status(200).json({
    success: true,
    data: leads,
  });
});

leadsRouter.get("/:id", requireTenant, async (req, res) => {
  const tenantId = req.requestContext?.tenantId as string;
  const leadId = String(req.params.id);

  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    res.status(404).json({
      success: false,
      error: {
        code: "LEAD_NOT_FOUND",
        message: `Lead ${leadId} not found`,
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: lead,
  });
});

leadsRouter.post(
  "/upload/preview",
  requireTenant,
  requireCapability("calls.live"),
  async (req, res) => {
    const tenantId = req.requestContext?.tenantId as string;
    const payload = (req.body ?? {}) as LeadUploadPreviewRequest;

    if (!payload.csvText && !payload.fileBase64 && (!payload.rows || payload.rows.length === 0)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Provide csvText, fileBase64, or rows for preview",
        },
      });
      return;
    }

    const result = await generateLeadUploadPreview({
      tenantId,
      payload,
    });

    res.status(200).json({
      success: true,
      data: result,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

leadsRouter.post(
  "/manual/preview",
  requireTenant,
  requireCapability("calls.live"),
  async (req, res) => {
    const tenantId = req.requestContext?.tenantId as string;
    const payload = (req.body ?? {}) as ManualLeadPreviewRequest;

    const result = await generateManualLeadPreview({
      tenantId,
      payload,
    });

    res.status(200).json({
      success: true,
      data: result,
      meta: {
        requestId: req.requestContext?.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

export default leadsRouter;
