import { createHash, randomUUID } from "node:crypto";

import { logger } from "../lib/logger";
import { normalizePhoneNumber } from "../lib/config";
import { prisma } from "../lib/prisma";
import { getVoiceCallProvider, NormalizedVoiceWebhook, TrialCallStatus, VoiceCallProvider, VoiceCallProviderError } from "./voiceCallProvider";

type TrialCallRecord = {
  id: string;
  tenantId: string | null;
  userId: string | null;
  webinarRegistrationId: string | null;
  phoneNumber: string;
  customerName: string | null;
  provider: string;
  providerCallId: string | null;
  agentId: string | null;
  status: TrialCallStatus;
  subStatus: string | null;
  callDirection: "INBOUND" | "OUTBOUND";
  durationSeconds: number | null;
  recordingUrl: string | null;
  transcript: string | null;
  outcome: string | null;
  outcomeData: unknown;
  initiatedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  lastWebhookAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TrialCallWebhookRecord = {
  id: string;
  processingStatus: "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";
};

type TrialCallDatabase = {
  trialCall: {
    create(args: { data: Record<string, unknown> }): Promise<TrialCallRecord>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<TrialCallRecord>;
    updateMany(args: { where: { id: string; status: string }; data: Record<string, unknown> }): Promise<{ count: number }>;
    findUnique(args: { where: { id: string } }): Promise<TrialCallRecord | null>;
    findFirst(args: { where: { provider: string; providerCallId: string } }): Promise<TrialCallRecord | null>;
    findMany(args: { where: Record<string, unknown>; take: number; orderBy: { createdAt: "desc" } }): Promise<TrialCallRecord[]>;
  };
  trialCallWebhookEvent: {
    create(args: { data: Record<string, unknown> }): Promise<TrialCallWebhookRecord>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<TrialCallWebhookRecord>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    findUnique(args: { where: { idempotencyKey: string } }): Promise<TrialCallWebhookRecord | null>;
  };
  webinarRegistration: {
    findUnique(args: { where: { id: string }; select: { name: true; phone: true } }): Promise<{ name: string; phone: string } | null>;
  };
};

const database = prisma as unknown as TrialCallDatabase;

export interface CreateTrialCallInput {
  tenantId?: string;
  userId?: string;
  webinarRegistrationId?: string;
  phoneNumber?: string;
  customerName?: string;
}

export interface TrialCallWebhookInput {
  provider: string;
  payload: unknown;
  rawBody: string;
  event: NormalizedVoiceWebhook;
}

function normalizePhoneNumber(value: string): string {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) {
    throw new Error("A valid customer phone number is required");
  }
  return normalized;
}

export async function createTrialCall(
  input: CreateTrialCallInput,
  provider: VoiceCallProvider = getVoiceCallProvider(),
  db = database,
): Promise<TrialCallRecord> {
  const registration = input.webinarRegistrationId
    ? await db.webinarRegistration.findUnique({
        where: { id: input.webinarRegistrationId },
        select: { name: true, phone: true },
      })
    : null;

  if (input.webinarRegistrationId && !registration) {
    throw new Error("Webinar customer was not found");
  }

  const phoneNumber = input.phoneNumber || registration?.phone;
  if (!phoneNumber) {
    throw new Error("A webinar customer or phone number is required");
  }

  return db.trialCall.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      webinarRegistrationId: input.webinarRegistrationId,
      phoneNumber: normalizePhoneNumber(phoneNumber),
      customerName: input.customerName?.trim() || registration?.name || null,
      provider: provider.name,
      status: "QUEUED",
      callDirection: "OUTBOUND",
    },
  });
}

export async function triggerTrialCall(
  id: string,
  provider: VoiceCallProvider,
  db = database,
): Promise<TrialCallRecord> {
  const call = await db.trialCall.findUnique({ where: { id } });
  if (!call) {
    throw new Error("Trial call was not found");
  }
  if (call.status !== "QUEUED") {
    throw new Error("Only queued trial calls can be triggered");
  }

  const claim = await db.trialCall.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "INITIATING", initiatedAt: new Date() },
  });
  if (!claim.count) {
    throw new Error("Only queued trial calls can be triggered");
  }

  const startedAtMs = Date.now();
  try {
    const phoneNumber = normalizePhoneNumber(call.phoneNumber);
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
      throw new VoiceCallProviderError("invalid_request", "Customer phone number must be in E.164 format");
    }
    if (!call.customerName?.trim()) {
      throw new VoiceCallProviderError("invalid_request", "A customer name is required to initiate this call");
    }

    await db.trialCall.update({ where: { id }, data: { phoneNumber } });
    const response = await provider.initiateCall({
      phoneNumber,
      customerName: call.customerName.trim(),
      trialCallId: call.id,
    });
    if (!response.providerCallId?.trim()) {
      throw new Error("Provider did not return a call identifier");
    }

    const updatedCall = await db.trialCall.update({
      where: { id },
      data: { providerCallId: response.providerCallId.trim(), status: "QUEUED" },
    });
    logger.info("Trial call initiated", {
      trialCallId: call.id,
      providerCallId: updatedCall.providerCallId,
      status: updatedCall.status,
      durationMs: Date.now() - startedAtMs,
    });
    return updatedCall;
  } catch (error) {
    const failureReason = error instanceof VoiceCallProviderError
      ? error.safeReason
      : "Trial call request failed";
    logger.warn("Trial call initiation failed", {
      trial_call_id: call.id,
      status: "FAILED",
      http_status: error instanceof VoiceCallProviderError ? error.httpStatus : undefined,
      duration_ms: Date.now() - startedAtMs,
    });
    return db.trialCall.update({
      where: { id },
      data: { status: "FAILED", failedAt: new Date(), failureReason },
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildIdempotencyKey(provider: string, event: NormalizedVoiceWebhook, payload: unknown): string {
  const identity = event.eventId
    ? `event:${event.eventId}`
    : event.providerCallId && event.occurredAt
      ? `call:${event.providerCallId}:type:${event.eventType}:at:${event.occurredAt.toISOString()}`
      : `payload:${canonicalJson(payload)}`;
  return createHash("sha256").update(`${provider}:${identity}`).digest("hex");
}

function callUpdateFromWebhook(event: NormalizedVoiceWebhook, call: TrialCallRecord): Record<string, unknown> {
  const status = call.status === "COMPLETED" || call.status === "FAILED" || call.status === "CANCELLED"
    ? call.status
    : event.status || call.status;
  const occurredAt = event.occurredAt || new Date();
  const update: Record<string, unknown> = { lastWebhookAt: new Date(), status };

  if (event.subStatus !== undefined) update.subStatus = event.subStatus;
  if (event.durationSeconds !== undefined) update.durationSeconds = event.durationSeconds;
  if (event.transcript !== undefined) update.transcript = event.transcript;
  if (event.recordingUrl !== undefined) update.recordingUrl = event.recordingUrl;
  if (event.outcome !== undefined) update.outcome = event.outcome;
  if (event.outcomeData !== undefined) update.outcomeData = event.outcomeData;
  if (event.failureReason !== undefined && status === "FAILED") update.failureReason = event.failureReason;
  if (status === "IN_PROGRESS" && !call.startedAt) update.startedAt = occurredAt;
  if (status === "COMPLETED" && !call.completedAt) update.completedAt = occurredAt;
  if (status === "FAILED" && !call.failedAt) update.failedAt = occurredAt;
  return update;
}

export async function processTrialCallWebhook(input: TrialCallWebhookInput, db = database): Promise<"processed" | "duplicate" | "ignored"> {
  const { provider, event, payload } = input;
  const idempotencyKey = buildIdempotencyKey(provider, event, payload);
  let storedEvent: TrialCallWebhookRecord;

  try {
    storedEvent = await db.trialCallWebhookEvent.create({
      data: {
        id: randomUUID(),
        provider,
        eventId: event.eventId || null,
        eventType: event.eventType,
        providerCallId: event.providerCallId || null,
        payload: payload as object,
        idempotencyKey,
        processingStatus: "PROCESSING",
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const duplicate = await db.trialCallWebhookEvent.findUnique({ where: { idempotencyKey } });
    if (!duplicate || duplicate.processingStatus !== "FAILED") return "duplicate";
    const claim = await db.trialCallWebhookEvent.updateMany({
      where: { id: duplicate.id, processingStatus: "FAILED" },
      data: { processingStatus: "PROCESSING", errorMessage: null },
    });
    if (!claim.count) return "duplicate";
    storedEvent = { ...duplicate, processingStatus: "PROCESSING" };
  }

  try {
    const call = event.providerCallId
      ? await db.trialCall.findFirst({ where: { provider, providerCallId: event.providerCallId } })
      : null;
    if (!call) {
      await db.trialCallWebhookEvent.update({
        where: { id: storedEvent.id },
        data: { processingStatus: "IGNORED", processedAt: new Date() },
      });
      return "ignored";
    }

    await db.trialCall.update({ where: { id: call.id }, data: callUpdateFromWebhook(event, call) });
    await db.trialCallWebhookEvent.update({
      where: { id: storedEvent.id },
      data: { processingStatus: "PROCESSED", processedAt: new Date() },
    });
    return "processed";
  } catch (error) {
    await db.trialCallWebhookEvent.update({
      where: { id: storedEvent.id },
      data: { processingStatus: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed" },
    });
    throw error;
  }
}

export async function receiveTrialCallWebhook(
  provider: VoiceCallProvider,
  input: { headers: Record<string, string | string[] | undefined>; rawBody: string; payload: unknown },
  db = database,
): Promise<"unauthorized" | "processed" | "duplicate" | "ignored"> {
  if (!await provider.validateWebhook({ headers: input.headers, rawBody: input.rawBody })) {
    return "unauthorized";
  }
  const event = provider.normalizeWebhook(input.payload);
  if (!event.eventType || !event.providerCallId) {
    throw new Error("Webhook is missing its event type or call identifier");
  }
  if (event.status && !["QUEUED", "INITIATING", "RINGING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"].includes(event.status)) {
    throw new Error("Webhook status is invalid");
  }
  if (event.durationSeconds !== undefined && (!Number.isInteger(event.durationSeconds) || event.durationSeconds < 0)) {
    throw new Error("Webhook duration is invalid");
  }
  if (event.occurredAt && Number.isNaN(event.occurredAt.getTime())) {
    throw new Error("Webhook timestamp is invalid");
  }
  return processTrialCallWebhook({ provider: provider.name, payload: input.payload, rawBody: input.rawBody, event }, db);
}

export async function getTrialCall(id: string, db = database): Promise<TrialCallRecord | null> {
  return db.trialCall.findUnique({ where: { id } });
}

export async function listTrialCalls(
  filters: { tenantId?: string; status?: TrialCallStatus; take: number },
  db = database,
): Promise<TrialCallRecord[]> {
  const where: Record<string, unknown> = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.status) where.status = filters.status;
  return db.trialCall.findMany({ where, take: filters.take, orderBy: { createdAt: "desc" } });
}