import { Request, Response, Router } from "express";

import { requireAuth } from "../../middleware/requireAuth";
import { requireCapability } from "../../middleware/requireCapability";
import { requireTenant } from "../../middleware/requireTenant";
import { getCallSessionByExternalId, getCallSessionById } from "../../repositories/callRepository";
import { listTranscriptSegments } from "../../repositories/transcriptRepository";

const transcriptRouter = Router();

transcriptRouter.get(
  "/:callId/transcript",
  requireAuth,
  requireTenant,
  requireCapability("transcripts.full"),
  async (req: Request, res: Response) => {
    const callId = String(req.params.callId);
    const tenantId = req.requestContext?.tenantId as string;
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 200);

    let resolvedCallId = callId;
    let callSession = null;

    try {
      callSession = await getCallSessionById(callId, tenantId);
    } catch (error) {
      // If the path value is an external call id, getCallSessionById will reject on invalid UUID.
      // We'll fallback to external ID resolution.
    }

    if (!callSession) {
      callSession = await getCallSessionByExternalId(callId, tenantId);
    }

    if (callSession) {
      resolvedCallId = callSession.id;
    }

    const result = await listTranscriptSegments({
      callId: resolvedCallId,
      tenantId,
      page,
      pageSize,
    });

    res.status(200).json({
      success: true,
      data: result.items.map((item) => ({
        id: item.id,
        callId: item.callId,
        speaker: item.speaker,
        text: item.text,
        isFinal: item.isFinal,
        sequenceNo: item.sequenceNo,
        providerMessageId: item.providerMessageId,
        occurredAt: item.occurredAt.toISOString(),
      })),
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

export default transcriptRouter;
