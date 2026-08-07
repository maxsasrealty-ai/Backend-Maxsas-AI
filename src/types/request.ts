import type { AuthRequestContext } from "../modules/auth/auth.types";

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  source: "api" | "webhook";
}

export interface WebhookHeaderContext {
  eventId?: string;
  callId?: string;
  occurredAt?: string;
}

export interface VoiceWebhookContext {
  requestContext: RequestContext;
  webhookHeaders: WebhookHeaderContext;
  rawBody?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthRequestContext;
      requestContext?: RequestContext;
    }
  }
}

export { };
