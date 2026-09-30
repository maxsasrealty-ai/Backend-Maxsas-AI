import { timingSafeEqual } from "node:crypto";

import { config } from "../lib/config";
import { normalizePhoneNumber } from "../lib/config";

export type TrialCallStatus =
  | "QUEUED"
  | "INITIATING"
  | "RINGING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface InitiateVoiceCallInput {
  phoneNumber: string;
  customerName: string;
  trialCallId: string;
}

export interface NormalizedVoiceWebhook {
  eventId?: string;
  eventType: string;
  providerCallId?: string;
  status?: TrialCallStatus;
  subStatus?: string;
  durationSeconds?: number;
  transcript?: string;
  recordingUrl?: string;
  outcome?: string;
  outcomeData?: unknown;
  occurredAt?: Date;
  failureReason?: string;
}

export const ringgWebhookEventTypes = [
  "call_started",
  "call_completed",
  "recording_completed",
  "analysis_completed",
  "call_analysis_completed",
  "all_processing_completed",
] as const;

export interface VoiceCallProvider {
  readonly name: string;
  initiateCall(input: InitiateVoiceCallInput): Promise<{ providerCallId: string }>;
  getCallDetails(providerCallId: string): Promise<unknown>;
  validateWebhook(input: { headers: Record<string, string | string[] | undefined>; rawBody: string }): Promise<boolean>;
  normalizeWebhook(payload: unknown): NormalizedVoiceWebhook;
}

export interface RinggVoiceProviderConfig {
  apiKey?: string;
  agentId?: string;
  numberPoolId?: string;
  fromNumberId?: string;
  fromNumber?: string;
  webhookBearerToken?: string;
}

type VoiceProviderErrorCode =
  | "configuration"
  | "invalid_request"
  | "authentication"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "network"
  | "malformed_response";

export class VoiceCallProviderError extends Error {
  constructor(
    readonly code: VoiceProviderErrorCode,
    readonly safeReason: string,
    readonly httpStatus?: number,
  ) {
    super(safeReason);
    this.name = "VoiceCallProviderError";
  }
}

const RINGG_API_URL = "https://prod-api.ringg.ai/ca/api/v0/calling/v2/outbound/individual";
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

function readRinggConfig(): RinggVoiceProviderConfig {
  return {
    apiKey: config.RINGG_API_KEY,
    agentId: config.RINGG_AGENT_ID,
    numberPoolId: config.RINGG_NUMBER_POOL_ID,
    fromNumberId: config.RINGG_FROM_NUMBER_ID,
    fromNumber: config.RINGG_FROM_NUMBER,
    webhookBearerToken: config.RINGG_WEBHOOK_BEARER_TOKEN,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function callerSource(config: RinggVoiceProviderConfig): Record<string, string> {
  const sources = [
    ["number_pool_id", config.numberPoolId],
    ["from_number_id", config.fromNumberId],
    ["from_number", config.fromNumber],
  ] as const;
  const configured = sources.filter(([, value]) => Boolean(value?.trim()));

  if (configured.length !== 1) {
    throw new VoiceCallProviderError("configuration", "Trial call provider configuration is incomplete");
  }

  const [field, value] = configured[0];
  if (field === "from_number") {
    const normalizedNumber = normalizePhoneNumber(value!);
    if (!E164_PATTERN.test(normalizedNumber)) {
      throw new VoiceCallProviderError("configuration", "Configured caller number must be in E.164 format");
    }
    return { [field]: normalizedNumber };
  }

  return { [field]: value!.trim() };
}

function providerErrorForStatus(status: number): VoiceCallProviderError {
  if (status === 400) return new VoiceCallProviderError("invalid_request", "Provider rejected the trial call request", status);
  if (status === 401 || status === 403) return new VoiceCallProviderError("authentication", "Trial call provider authentication failed", status);
  if (status === 404) return new VoiceCallProviderError("not_found", "Configured trial call resource was not found", status);
  if (status === 429) return new VoiceCallProviderError("rate_limited", "Trial call provider rate limit exceeded", status);
  if (status >= 500) return new VoiceCallProviderError("unavailable", "Trial call provider is unavailable", status);
  return new VoiceCallProviderError("network", "Trial call provider request failed", status);
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return undefined;
}

function readValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function normalizeTranscript(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(value);
  return undefined;
}

function normalizeOccurredAt(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const date = new Date(typeof value === "number" ? value : String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Webhook timestamp is invalid");
  return date;
}

function normalizeAnalysis(value: unknown): { outcome?: string; outcomeData?: unknown } {
  if (value === undefined || value === null) return {};
  if (isRecord(value)) {
    return {
      outcome: readString(value, "outcome", "call_outcome"),
      outcomeData: value,
    };
  }
  return { outcomeData: value };
}

export class RinggVoiceCallProvider implements VoiceCallProvider {
  readonly name = "ringg";

  constructor(
    private readonly ringgConfig: RinggVoiceProviderConfig = readRinggConfig(),
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async initiateCall(input: InitiateVoiceCallInput): Promise<{ providerCallId: string }> {
    const apiKey = this.ringgConfig.apiKey?.trim();
    const agentId = this.ringgConfig.agentId?.trim();
    if (!apiKey || !agentId) {
      throw new VoiceCallProviderError("configuration", "Trial call provider configuration is incomplete");
    }

    const name = input.customerName.trim();
    if (!name) {
      throw new VoiceCallProviderError("invalid_request", "A customer name is required to initiate this call");
    }

    const mobileNumber = normalizePhoneNumber(input.phoneNumber);
    if (!E164_PATTERN.test(mobileNumber)) {
      throw new VoiceCallProviderError("invalid_request", "Customer phone number must be in E.164 format");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(RINGG_API_URL, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          mobile_number: mobileNumber,
          agent_id: agentId,
          ...callerSource(this.ringgConfig),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw providerErrorForStatus(response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new VoiceCallProviderError("malformed_response", "Trial call provider returned an invalid response", response.status);
      }

      const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
      const providerCallId = typeof data?.call_id === "string" ? data.call_id.trim() : "";
      if (!providerCallId) {
        throw new VoiceCallProviderError("malformed_response", "Trial call provider response did not include a call identifier", response.status);
      }

      return { providerCallId };
    } catch (error) {
      if (error instanceof VoiceCallProviderError) throw error;
      if (controller.signal.aborted) {
        throw new VoiceCallProviderError("timeout", "Trial call provider request timed out");
      }
      throw new VoiceCallProviderError("network", "Trial call provider request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  async getCallDetails(_providerCallId: string): Promise<unknown> {
    throw new Error("Trial call details are not enabled in this outbound-only integration");
  }

  async validateWebhook(input: { headers: Record<string, string | string[] | undefined>; rawBody: string }): Promise<boolean> {
    const expectedToken = this.ringgConfig.webhookBearerToken?.trim();
    const authorization = input.headers.authorization;
    if (!expectedToken || typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;

    try {
      const payload = JSON.parse(input.rawBody);
      if (!isRecord(payload)) return false;
    } catch {
      return false;
    }

    const suppliedToken = authorization.slice("Bearer ".length).trim();
    const expectedBytes = Buffer.from(expectedToken);
    const suppliedBytes = Buffer.from(suppliedToken);
    return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
  }

  normalizeWebhook(payload: unknown): NormalizedVoiceWebhook {
    if (!isRecord(payload)) throw new Error("Webhook payload must be an object");
    const data = isRecord(payload.data) ? payload.data : payload;
    const eventType = readString(payload, "event_type", "eventType") || readString(data, "event_type", "eventType");
    const providerCallId = readString(payload, "call_id", "callId") || readString(data, "call_id", "callId");
    if (!eventType || !providerCallId) throw new Error("Webhook is missing its event type or call identifier");
    if (!ringgWebhookEventTypes.includes(eventType as typeof ringgWebhookEventTypes[number])) {
      throw new Error("Webhook event type is not supported");
    }

    const analysisValue = readValue(payload, "analysis") ?? readValue(data, "analysis");
    const analysis = normalizeAnalysis(analysisValue);
    const topLevelOutcome = readString(payload, "outcome", "call_outcome") || readString(data, "outcome", "call_outcome");
    const topLevelOutcomeData = readValue(payload, "outcome_data", "outcomeData") ?? readValue(data, "outcome_data", "outcomeData");
    const durationValue = readValue(payload, "duration_seconds", "durationSeconds") ?? readValue(data, "duration_seconds", "durationSeconds");
    if (durationValue !== undefined && (!Number.isInteger(durationValue) || (durationValue as number) < 0)) {
      throw new Error("Webhook duration is invalid");
    }

    const transcriptValue = readValue(payload, "transcript") ?? readValue(data, "transcript");
    const recordingUrl = readString(payload, "recording_url", "recordingUrl") || readString(data, "recording_url", "recordingUrl");
    const normalized: NormalizedVoiceWebhook = {
      eventId: readString(payload, "event_id", "eventId") || readString(data, "event_id", "eventId"),
      eventType,
      providerCallId,
      durationSeconds: durationValue as number | undefined,
      transcript: normalizeTranscript(transcriptValue),
      recordingUrl,
      outcome: analysis.outcome || topLevelOutcome,
      outcomeData: analysis.outcomeData ?? topLevelOutcomeData,
      occurredAt: normalizeOccurredAt(readValue(payload, "occurred_at", "occurredAt", "timestamp") ?? readValue(data, "occurred_at", "occurredAt", "timestamp")),
    };

    if (eventType === "call_started") normalized.status = "IN_PROGRESS";
    if (eventType === "call_completed" || eventType === "all_processing_completed") normalized.status = "COMPLETED";
    return normalized;
  }
}

let configuredProvider: VoiceCallProvider | undefined;

export function getVoiceCallProvider(): VoiceCallProvider {
  configuredProvider ??= new RinggVoiceCallProvider();
  return configuredProvider;
}