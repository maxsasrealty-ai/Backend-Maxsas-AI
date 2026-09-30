import { Request, Response, Router } from "express";
import { z } from "zod";

import { requireAdminAccess } from "../middleware/requireAdminAccess";
import {
  createTrialCall,
  getTrialCall,
  listTrialCalls,
  receiveTrialCallWebhook,
  triggerTrialCall,
} from "../services/trialCallService";
import { getVoiceCallProvider, TrialCallStatus } from "../services/voiceCallProvider";

const trialCallsRouter = Router();
trialCallsRouter.use(requireAdminAccess);

export const createTrialCallSchema = z.object({
  tenantId: z.string().min(1).max(128).optional(),
  userId: z.string().uuid().optional(),
  webinarRegistrationId: z.string().min(1).optional(),
  phoneNumber: z.string().min(1).max(32).optional(),
  customerName: z.string().max(160).optional(),
}).strict();

export const triggerTrialCallRequestSchema = z.object({}).strict();

const trialCallStatuses: TrialCallStatus[] = [
  "QUEUED", "INITIATING", "RINGING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED",
];

export function toPublicTrialCall(call: NonNullable<Awaited<ReturnType<typeof getTrialCall>>> | null) {
  if (!call) return null;
  return {
    id: call.id,
    tenantId: call.tenantId,
    userId: call.userId,
    webinarRegistrationId: call.webinarRegistrationId,
    phoneNumber: call.phoneNumber,
    customerName: call.customerName,
    status: call.status,
    subStatus: call.subStatus,
    callDirection: call.callDirection,
    durationSeconds: call.durationSeconds,
    transcript: call.transcript,
    outcome: call.outcome,
    outcomeData: call.outcomeData,
    initiatedAt: call.initiatedAt,
    startedAt: call.startedAt,
    completedAt: call.completedAt,
    failedAt: call.failedAt,
    failureReason: call.failureReason ? "Trial call could not be initiated or completed" : null,
    lastWebhookAt: call.lastWebhookAt,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
  };
}

trialCallsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = createTrialCallSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "INVALID_TRIAL_CALL", message: "Invalid trial call request" } });
    return;
  }
  try {
    const call = await createTrialCall(parsed.data, getVoiceCallProvider());
    res.status(201).json({ success: true, data: toPublicTrialCall(call) });
  } catch (error) {
    const notFound = error instanceof Error && error.message === "Webinar customer was not found";
    res.status(notFound ? 404 : 400).json({
      success: false,
      error: { code: notFound ? "WEBINAR_CUSTOMER_NOT_FOUND" : "INVALID_TRIAL_CALL", message: error instanceof Error ? error.message : "Unable to create trial call" },
    });
  }
});

trialCallsRouter.post("/:id/trigger", async (req: Request, res: Response) => {
  const parsed = triggerTrialCallRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "INVALID_TRIAL_CALL_REQUEST", message: "Trigger request cannot include provider configuration" } });
    return;
  }
  try {
    const call = await triggerTrialCall(req.params.id, getVoiceCallProvider());
    const failed = call.status === "FAILED";
    res.status(failed ? 502 : 200).json({ success: !failed, data: toPublicTrialCall(call) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to trigger trial call";
    const status = message === "Trial call was not found" ? 404 : 409;
    res.status(status).json({ success: false, error: { code: "TRIAL_CALL_NOT_TRIGGERED", message } });
  }
});

trialCallsRouter.get("/", async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const parsedTake = Number(req.query.take ?? 50);
  if ((status && !trialCallStatuses.includes(status as TrialCallStatus)) || !Number.isInteger(parsedTake) || parsedTake < 1 || parsedTake > 100) {
    res.status(400).json({ success: false, error: { code: "INVALID_TRIAL_CALL_FILTER", message: "Invalid trial call filters" } });
    return;
  }
  const calls = await listTrialCalls({ tenantId, status: status as TrialCallStatus | undefined, take: parsedTake });
  res.json({ success: true, data: calls.map(toPublicTrialCall) });
});

trialCallsRouter.get("/:id/recording", async (req: Request, res: Response) => {
  const call = await getTrialCall(req.params.id);
  if (!call) {
    res.status(404).json({ success: false, error: { code: "TRIAL_CALL_NOT_FOUND", message: "Trial call was not found" } });
    return;
  }
  if (!call.recordingUrl) {
    res.status(404).json({ success: false, error: { code: "TRIAL_CALL_RECORDING_NOT_FOUND", message: "Trial call recording is not available" } });
    return;
  }
  res.json({ success: true, data: { trialCallId: call.id, available: true, recordingUrl: call.recordingUrl } });
});

trialCallsRouter.get("/:id", async (req: Request, res: Response) => {
  const call = await getTrialCall(req.params.id);
  if (!call) {
    res.status(404).json({ success: false, error: { code: "TRIAL_CALL_NOT_FOUND", message: "Trial call was not found" } });
    return;
  }
  res.json({ success: true, data: toPublicTrialCall(call) });
});

const voiceProviderWebhookRouter = Router();
voiceProviderWebhookRouter.post("/", async (req: Request, res: Response) => {
  if (typeof req.rawBody !== "string" || !req.body || typeof req.body !== "object") {
    res.status(400).json({ success: false, error: { code: "INVALID_WEBHOOK", message: "Invalid webhook body" } });
    return;
  }
  try {
    const result = await receiveTrialCallWebhook(getVoiceCallProvider(), {
      headers: req.headers,
      rawBody: req.rawBody,
      payload: req.body,
    });
    if (result === "unauthorized") {
      res.status(401).json({ success: false, error: { code: "INVALID_WEBHOOK_AUTH", message: "Webhook authentication failed" } });
      return;
    }
    res.status(200).json({ success: true, data: { received: true, duplicate: result === "duplicate" } });
  } catch {
    res.status(400).json({ success: false, error: { code: "INVALID_WEBHOOK", message: "Webhook could not be processed" } });
  }
});

export { trialCallsRouter, voiceProviderWebhookRouter };