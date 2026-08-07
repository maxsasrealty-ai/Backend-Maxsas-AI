import { z, type ZodIssue } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().default(4000),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  REDIS_DISABLED: z.string().optional(),
  OUTBOUND_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  API_BASE_URL: z.string().default("http://localhost:4000"),
  VOICE_WEBHOOK_PUBLIC_URL: z.string().optional(),
  BACKEND_WEBHOOK_URL: z.string().optional(),
  LIVEKIT_AGENT_NAME: z.string().min(1).default("maxsas-voice-agent-prod"),
  LIVEKIT_URL: z.string().min(1).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  SIP_OUTBOUND_TRUNK_ID: z.string().min(1).optional(),
  LIVEKIT_OUTBOUND_TRUNK_ID: z.string().min(1).optional(),
  VOICE_WEBHOOK_BEARER_TOKEN: z.string().min(1).optional(),
  BACKEND_WEBHOOK_TOKEN: z.string().min(1).optional(),
  BACKEND_WEBHOOK_AUTH_TOKEN: z.string().min(1).optional(),
  AUTH_BEARER_TOKEN: z.string().min(1).optional(),
  ACCESS_TOKEN_SECRET: z.string().min(1).optional(),
  REFRESH_TOKEN_SECRET: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  BREVO_API_KEY: z.string().min(1).optional(),
  ADMIN_API_KEY: z.string().min(1).optional(),
  PAYU_KEY: z.string().min(1).optional(),
  PAYU_SALT: z.string().min(1).optional(),
  PAYU_MODE: z.enum(["test", "live"]).optional(),
  PAYU_VERIFY_URL: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  DEV_AUTH_EMAIL: z.string().optional(),
  DEV_AUTH_PASSWORD: z.string().optional(),
  DEV_AUTH_FULL_NAME: z.string().optional(),
  DEV_AUTH_TENANT_ID: z.string().optional(),
  DEV_AUTH_TENANT_NAME: z.string().optional(),
  WEBHOOK_BRIDGE_ENABLED: z
    .string()
    .optional()
    .transform((value: string | undefined) => value === "true"),
  WEBHOOK_SERVER_BASE_URL: z.string().optional(),
  WEBHOOK_BRIDGE_POLL_MS: z.coerce.number().int().positive().default(4000),
  VOICE_TEST_MODE: z
    .string()
    .optional()
    .transform((value: string | undefined) => value === "true"),
  BILLING_BYPASS: z
    .string()
    .optional()
    .transform((value: string | undefined) => value === "true"),
  LOCAL_DEVELOPMENT_SAFE_MODE: z
    .string()
    .optional()
    .transform((value: string | undefined) => value === "true"),
  ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS: z
    .string()
    .optional()
    .transform((value: string | undefined) => value === "true"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue: ZodIssue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const env = parsed.data as z.infer<typeof envSchema>;

function deriveAgentLogsWebhookUrl(voiceEventsWebhookUrl: string): string {
  const normalized = voiceEventsWebhookUrl.replace(/\/$/, "");
  if (normalized.endsWith("/api/webhooks/voice/events")) {
    return normalized.replace(/\/api\/webhooks\/voice\/events$/, "/api/webhooks/voice/agent-logs");
  }

  try {
    const parsedUrl = new URL(normalized);
    return `${parsedUrl.origin}/api/webhooks/voice/agent-logs`;
  } catch {
    return `${normalized}/api/webhooks/voice/agent-logs`;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function classifyUrlTarget(rawUrl: string | undefined): "local" | "remote" | "unknown" {
  if (!rawUrl) {
    return "unknown";
  }

  try {
    const parsedUrl = new URL(rawUrl);
    return isLoopbackHost(parsedUrl.hostname) ? "local" : "remote";
  } catch {
    return /^(localhost|127\.0\.0\.1|::1)(:\d+)?$/i.test(rawUrl) ? "local" : "unknown";
  }
}

const isLocalRuntime = env.APP_ENV !== "production" && env.NODE_ENV !== "test";
const isLocalSafetyMode =
  typeof env.LOCAL_DEVELOPMENT_SAFE_MODE === "boolean"
    ? env.LOCAL_DEVELOPMENT_SAFE_MODE
    : isLocalRuntime;
const allowDangerousLocalSideEffects = Boolean(env.ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS);

function buildStartupWarnings(): string[] {
  const warnings: string[] = [];

  if (env.APP_ENV === "production") {
    if (env.PAYU_MODE === "test") {
      warnings.push("PAYU_MODE is set to test in production, so wallet top-ups will stay on the PayU sandbox checkout");
    }

    if (
      env.PAYU_MODE === "live" &&
      (env.PAYU_KEY === "D0Fjcc" || env.PAYU_SALT === "Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ")
    ) {
      warnings.push("PAYU_MODE is live but PayU test credentials are still configured; replace them with the production merchant key and salt");
    }

    if (
      env.PAYU_MODE === "test" &&
      (env.PAYU_KEY === "D0Fjcc" || env.PAYU_SALT === "Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ")
    ) {
      warnings.push("Test PayU credentials are configured in production; replace them with production merchant key and salt");
    }

    if (env.PAYU_VERIFY_URL && /test\.payu\.in/i.test(env.PAYU_VERIFY_URL)) {
      warnings.push("PAYU_VERIFY_URL still points to the PayU test verify endpoint in production");
    }

    if (!env.ADMIN_API_KEY) {
      warnings.push("ADMIN_API_KEY is missing in production and admin routes will fall back to the default development key");
    }

    if (!env.AUTH_BEARER_TOKEN) {
      warnings.push("AUTH_BEARER_TOKEN is missing in production and auth middleware will fall back to the default development token");
    }

    if (!env.VOICE_WEBHOOK_BEARER_TOKEN && !env.BACKEND_WEBHOOK_TOKEN && !env.BACKEND_WEBHOOK_AUTH_TOKEN) {
      warnings.push("No webhook auth token is configured in production");
    }
  }

  if (isLocalSafetyMode && !allowDangerousLocalSideEffects) {
    if (classifyUrlTarget(env.DATABASE_URL) === "remote") {
      warnings.push("DATABASE_URL points to a remote database while local safety mode is enabled");
    }

    if (classifyUrlTarget(env.REDIS_URL) === "remote") {
      warnings.push("REDIS_URL points to a remote Redis instance while local safety mode is enabled");
    }

    if (classifyUrlTarget(env.LIVEKIT_URL || undefined) === "remote") {
      warnings.push("LIVEKIT_URL points to a remote LiveKit cluster while local safety mode is enabled");
    }

    if (env.PAYU_MODE === "live") {
      warnings.push("PAYU_MODE is live while local safety mode is enabled; payment flows will be forced into mock behavior");
    }

    if (env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_SECRET) {
      warnings.push("Razorpay credentials are configured while local safety mode is enabled; payment flows will be mocked");
    }

    if (env.VOICE_WEBHOOK_PUBLIC_URL && classifyUrlTarget(env.VOICE_WEBHOOK_PUBLIC_URL) === "remote") {
      warnings.push("VOICE_WEBHOOK_PUBLIC_URL points to a remote host while local safety mode is enabled");
    }
  }

  return warnings;
}

const resolvedWebhookBase = (env.VOICE_WEBHOOK_PUBLIC_URL || env.API_BASE_URL).replace(/\/$/, "");
const resolvedVoiceWebhookUrl = env.BACKEND_WEBHOOK_URL || `${resolvedWebhookBase}/api/webhooks/voice/events`;
const resolvedWebhookToken =
  env.VOICE_WEBHOOK_BEARER_TOKEN ||
  env.BACKEND_WEBHOOK_TOKEN ||
  env.BACKEND_WEBHOOK_AUTH_TOKEN;

const corsAllowedOrigins = (env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  ...env,
  isProduction: env.APP_ENV === "production",
  isLocalRuntime,
  isLocalSafetyMode,
  allowDangerousLocalSideEffects,
  isTestMode: Boolean(env.VOICE_TEST_MODE),
  isBillingBypass: Boolean(env.BILLING_BYPASS),
  isWebhookBridgeEnabled: Boolean(env.WEBHOOK_BRIDGE_ENABLED),
  sipTrunkId: env.SIP_OUTBOUND_TRUNK_ID || env.LIVEKIT_OUTBOUND_TRUNK_ID || "",
  voiceWebhookUrl: resolvedVoiceWebhookUrl,
  agentLogsWebhookUrl: deriveAgentLogsWebhookUrl(resolvedVoiceWebhookUrl),
  webhookAuthToken: resolvedWebhookToken,
  authBearerToken: env.AUTH_BEARER_TOKEN || "dev_token",
  accessTokenSecret: env.ACCESS_TOKEN_SECRET || "dev-access-token-secret",
  refreshTokenSecret: env.REFRESH_TOKEN_SECRET || "dev-refresh-token-secret",
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },
  brevo: {
    apiKey: env.BREVO_API_KEY,
  },
  webhookBridgeSourceUrl: (env.WEBHOOK_SERVER_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, ""),
  webhookBridgePollMs: env.WEBHOOK_BRIDGE_POLL_MS,
  corsAllowedOrigins,
  googleClientId: env.GOOGLE_CLIENT_ID || "",
  databaseTarget: classifyUrlTarget(env.DATABASE_URL),
  redisTarget: classifyUrlTarget(env.REDIS_URL),
  startupWarnings: buildStartupWarnings(),
};

export function normalizePhoneNumber(phoneNumber: string): string {
  const digitsOnly = phoneNumber.trim().replace(/\D/g, "");

  if (!digitsOnly) {
    throw new Error("A valid phone number is required.");
  }

  return `+${digitsOnly}`;
}

export function buildLivekitMetadata(input: {
  callId: string;
  tenantId: string;
  roomId: string;
  phoneNumber: string;
  agentName?: string | null;
  direction?: string | null;
  extras?: Record<string, unknown>;
}): Record<string, unknown> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const agentName = input.agentName?.trim() || config.LIVEKIT_AGENT_NAME;

  return {
    callId: input.callId,
    call_id: input.callId,
    tenantId: input.tenantId,
    tenant_id: input.tenantId,
    roomId: input.roomId,
    room_id: input.roomId,
    agentName,
    agent_name: agentName,
    direction: input.direction || "outbound",
    phone_number: phoneNumber,
    ...(input.extras || {}),
  };
}

export function serializeLivekitMetadata(input: Parameters<typeof buildLivekitMetadata>[0]): string {
  return JSON.stringify(buildLivekitMetadata(input));
}

/**
 * Resolve outbound trunk ID with deterministic priority:
 * 1. SIP_OUTBOUND_TRUNK_ID (primary)
 * 2. LIVEKIT_OUTBOUND_TRUNK_ID (fallback)
 * 3. Throws error if neither is configured
 * 
 * Returns trunk ID and its source for structured logging.
 */
export function resolveOutboundTrunk(): { trunkId: string; source: "SIP_OUTBOUND_TRUNK_ID" | "LIVEKIT_OUTBOUND_TRUNK_ID" } {
  if (env.SIP_OUTBOUND_TRUNK_ID) {
    return { trunkId: env.SIP_OUTBOUND_TRUNK_ID, source: "SIP_OUTBOUND_TRUNK_ID" };
  }
  if (env.LIVEKIT_OUTBOUND_TRUNK_ID) {
    return { trunkId: env.LIVEKIT_OUTBOUND_TRUNK_ID, source: "LIVEKIT_OUTBOUND_TRUNK_ID" };
  }
  throw new Error("outbound_trunk_missing: Neither SIP_OUTBOUND_TRUNK_ID nor LIVEKIT_OUTBOUND_TRUNK_ID is configured");
}
