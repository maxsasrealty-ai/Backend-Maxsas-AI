import { AgentDispatchClient, RoomServiceClient, SipClient } from "livekit-server-sdk";

import { config, normalizePhoneNumber, serializeLivekitMetadata, resolveOutboundTrunk } from "../lib/config";
import { logger } from "../lib/logger";
import { emitCallEvent } from "./callObservabilityService";

/**
 * This service acts as the explicit boundary between the internal Maxsas backend
 * and the external voice system (e.g., LiveKit / VAPI worker node).
 */

export interface TelephonyDispatchRequest {
  callId: string;
  tenantId: string;
  roomId: string;
  phoneNumber: string | null;
  agentName: string | null;
  direction: string | null;
  callDurationLimitEnabled?: boolean;
  callDurationLimitSec?: number | null;
}

/**
 * Stage-specific structured error codes
 */
export type TelephonyErrorStage = "room_create_failed" | "dispatch_create_failed" | "sip_participant_create_failed" | "outbound_trunk_missing" | "config_validation_failed";

export class TelephonyError extends Error {
  constructor(
    public stage: TelephonyErrorStage,
    message: string,
    public context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "TelephonyError";
  }
}

/**
 * Contract validation layer for outbound call dispatch
 * 
 * Validates that all required metadata fields are present before
 * executing telephony engine operations. This is a fail-fast check
 * to catch contract violations early.
 * 
 * Required fields:
 * - callId: unique call identifier
 * - tenantId: multi-tenant isolation
 * - roomId: LiveKit room name
 * - phoneNumber: E.164 format phone number
 */
export interface ContractValidationResult {
  valid: boolean;
  missingFields: string[];
  error?: string;
}

function buildWebhookMetadataFields(webhookConfig: {
  voiceEventsWebhookUrl: string;
  agentLogsWebhookUrl: string;
  webhookAuthToken: string;
  BACKEND_WEBHOOK_URL: string;
  BACKEND_WEBHOOK_TOKEN: string;
  BACKEND_WEBHOOK_AUTH_TOKEN: string;
}): Record<string, unknown> {
  return {
    // Preferred keys used by agent runtime docs
    webhookUrl: webhookConfig.voiceEventsWebhookUrl,
    logsWebhookUrl: webhookConfig.agentLogsWebhookUrl,
    webhookAuthToken: webhookConfig.webhookAuthToken,
    // Backward-compatible snake_case keys
    webhook_url: webhookConfig.voiceEventsWebhookUrl,
    agent_logs_webhook_url: webhookConfig.agentLogsWebhookUrl,
    // Backward-compatible env-style keys
    BACKEND_WEBHOOK_URL: webhookConfig.BACKEND_WEBHOOK_URL,
    BACKEND_WEBHOOK_TOKEN: webhookConfig.BACKEND_WEBHOOK_TOKEN,
    BACKEND_WEBHOOK_AUTH_TOKEN: webhookConfig.BACKEND_WEBHOOK_AUTH_TOKEN,
    VOICE_WEBHOOK_BEARER_TOKEN: webhookConfig.webhookAuthToken,
    BACKEND_AGENT_LOGS_WEBHOOK_URL: webhookConfig.agentLogsWebhookUrl,
    // Additional camelCase aliases used by some agent runtimes.
    backendWebhookUrl: webhookConfig.voiceEventsWebhookUrl,
    backendLogsWebhookUrl: webhookConfig.agentLogsWebhookUrl,
    backendWebhookToken: webhookConfig.webhookAuthToken,
    backendWebhookAuthToken: webhookConfig.webhookAuthToken,
    voiceEventsWebhookUrl: webhookConfig.voiceEventsWebhookUrl,
    agentLogsWebhookUrl: webhookConfig.agentLogsWebhookUrl,
    voiceWebhookBearerToken: webhookConfig.webhookAuthToken,
    // Rich nested object for future compatibility
    webhook_config: webhookConfig,
  };
}

function buildCallDurationMetadataFields(request: TelephonyDispatchRequest): Record<string, unknown> {
  const enabled = Boolean(request.callDurationLimitEnabled);
  const durationSec = typeof request.callDurationLimitSec === "number" ? request.callDurationLimitSec : null;

  return {
    callDurationLimitEnabled: enabled,
    callDurationLimitSec: enabled ? durationSec : null,
    call_duration_limit_enabled: enabled,
    call_duration_limit_sec: enabled ? durationSec : null,
  };
}

export function validateOutboundDispatchContract(request: TelephonyDispatchRequest): ContractValidationResult {
  const missingFields: string[] = [];

  // Validate required string fields (non-empty)
  if (!request.callId || typeof request.callId !== "string") {
    missingFields.push("callId");
  }
  if (!request.tenantId || typeof request.tenantId !== "string") {
    missingFields.push("tenantId");
  }
  if (!request.roomId || typeof request.roomId !== "string") {
    missingFields.push("roomId");
  }

  // Validate phone number format (required for SIP)
  if (!request.phoneNumber || typeof request.phoneNumber !== "string") {
    missingFields.push("phoneNumber");
  }

  const resolvedAgentName = request.agentName?.trim() || config.LIVEKIT_AGENT_NAME?.trim();
  if (!resolvedAgentName) {
    missingFields.push("agentName");
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      error: `Contract validation failed: missing required fields: ${missingFields.join(", ")}`,
    };
  }

  return {
    valid: true,
    missingFields: [],
  };
}

export async function dispatchToTelephonyEngine(request: TelephonyDispatchRequest): Promise<void> {
  // Stage 0: Contract validation - fail fast if required metadata is missing
  const contractValidation = validateOutboundDispatchContract(request);
  if (!contractValidation.valid) {
    logger.error("Dispatch contract validation failed", {
      missing_fields: contractValidation.missingFields,
      error: contractValidation.error,
      request: request,
    });
    throw new TelephonyError(
      "config_validation_failed",
      contractValidation.error || "Contract validation failed",
      { missing_fields: contractValidation.missingFields }
    );
  }

  const contextLog = {
    call_id: request.callId,
    tenant_id: request.tenantId,
    room_id: request.roomId,
    agent_name: request.agentName || config.LIVEKIT_AGENT_NAME,
    trunk_source: "",
  };

  if (!request.phoneNumber) {
    logger.error("Phone number validation failed", {
      ...contextLog,
      stage: "config_validation_failed",
    });
    throw new TelephonyError(
      "config_validation_failed",
      "A valid phone number is required for outbound SIP participant creation",
      { ...contextLog }
    );
  }

  const roomName = request.roomId || `call-${request.callId}`;
  const formattedPhone = normalizePhoneNumber(request.phoneNumber);
  const resolvedAgentName = request.agentName?.trim() || config.LIVEKIT_AGENT_NAME;

  if (config.isLocalSafetyMode && !config.allowDangerousLocalSideEffects) {
    logger.warn("Local safety mode active; skipping LiveKit and SIP dispatch", {
      ...contextLog,
      room_name: roomName,
      formatted_phone: formattedPhone,
    });

    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "room_created",
      status: "success",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
        phone_number: formattedPhone,
        simulated: true,
      },
    });

    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "dispatch_attempt",
      status: "pending",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
        simulated: true,
      },
    });

    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "dispatch_success",
      status: "success",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
        simulated: true,
      },
    });

    return;
  }

  // Validate and resolve outbound trunk ID with source tracking
  let trunkId: string;
  let trunkSource: string;
  try {
    const { trunkId: resolved, source } = resolveOutboundTrunk();
    trunkId = resolved;
    trunkSource = source;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error("Trunk resolution failed", {
      ...contextLog,
      error: errorMsg,
      stage: "outbound_trunk_missing",
    });
    throw new TelephonyError(
      "outbound_trunk_missing",
      `Unable to resolve outbound trunk: ${errorMsg}`,
      { ...contextLog, trunk_source: null }
    );
  }

  contextLog.trunk_source = trunkSource;

  // Validate LiveKit configuration
  if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) {
    const missingVars = [
      !config.LIVEKIT_URL && "LIVEKIT_URL",
      !config.LIVEKIT_API_KEY && "LIVEKIT_API_KEY",
      !config.LIVEKIT_API_SECRET && "LIVEKIT_API_SECRET",
    ]
      .filter(Boolean)
      .join(", ");
    logger.error("LiveKit configuration incomplete", {
      ...contextLog,
      missing_vars: missingVars,
      stage: "config_validation_failed",
    });
    throw new TelephonyError(
      "config_validation_failed",
      `LiveKit configuration incomplete: ${missingVars}`,
      { ...contextLog }
    );
  }

  const roomClient = new RoomServiceClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  const sipClient = new SipClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  const callDurationMetadata = buildCallDurationMetadataFields(request);

  if (!config.voiceWebhookUrl || !config.webhookAuthToken) {
    const missingDispatchConfig = [
      !config.voiceWebhookUrl && "voiceWebhookUrl",
      !config.webhookAuthToken && "webhookAuthToken",
    ].filter(Boolean) as string[];

    logger.error("Webhook dispatch configuration incomplete", {
      ...contextLog,
      missing_fields: missingDispatchConfig,
      stage: "config_validation_failed",
    });
    throw new TelephonyError(
      "config_validation_failed",
      `Webhook dispatch configuration incomplete: ${missingDispatchConfig.join(", ")}`,
      { ...contextLog, missing_fields: missingDispatchConfig }
    );
  }
  
  // Build webhook configuration for the agent
  const webhookConfig = {
    voiceEventsWebhookUrl: config.voiceWebhookUrl,
    agentLogsWebhookUrl: config.agentLogsWebhookUrl,
    webhookAuthToken: config.webhookAuthToken,
    BACKEND_WEBHOOK_URL: config.voiceWebhookUrl,
    BACKEND_WEBHOOK_TOKEN: config.webhookAuthToken,
    BACKEND_WEBHOOK_AUTH_TOKEN: config.webhookAuthToken,
  };

  logger.info("Webhook configuration resolved", {
    ...contextLog,
    webhook_url: webhookConfig.voiceEventsWebhookUrl,
    has_auth_token: !!webhookConfig.webhookAuthToken,
  });

  const webhookMetadata = buildWebhookMetadataFields(webhookConfig);
  
  // Stage 1: Create the persistent Room
  try {
    await roomClient.createRoom({
      name: roomName,
      emptyTimeout: 10 * 60, // 10 minutes
      metadata: serializeLivekitMetadata({
        tenantId: request.tenantId,
        callId: request.callId,
        roomId: roomName,
        phoneNumber: formattedPhone,
        agentName: resolvedAgentName,
        direction: request.direction,
        extras: {
          room_id: roomName,
          phone_number: formattedPhone,
          agent_name: resolvedAgentName,
          trunk_id: trunkId,
          ...callDurationMetadata,
          ...webhookMetadata,
        },
      }),
    });
    logger.info("LiveKit room created", {
      ...contextLog,
      room_name: roomName,
      formatted_phone: formattedPhone,
    });

    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "room_created",
      status: "success",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
        phone_number: formattedPhone,
      },
    });
  } catch (roomErr) {
    const errorMsg = roomErr instanceof Error ? roomErr.message : "Unknown error";
    logger.error("LiveKit room creation failed", {
      ...contextLog,
      error: errorMsg,
      stage: "room_create_failed",
    });
    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "room_created",
      status: "failed",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
      },
      error: errorMsg,
    });
    throw new TelephonyError(
      "room_create_failed",
      `Failed to create LiveKit room: ${errorMsg}`,
      { ...contextLog, error: errorMsg }
    );
  }

  // Stage 2: Create agent dispatch (non-critical, failure does not block SIP participant creation)
  try {
    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "dispatch_attempt",
      status: "pending",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
      },
    });

    const agentClient = new AgentDispatchClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
    await agentClient.createDispatch(roomName, resolvedAgentName, {
      metadata: serializeLivekitMetadata({
        tenantId: request.tenantId,
        callId: request.callId,
        roomId: roomName,
        phoneNumber: formattedPhone,
        agentName: resolvedAgentName,
        direction: request.direction,
        extras: {
          room_id: roomName,
          phone_number: formattedPhone,
          agent_name: resolvedAgentName,
          trunk_id: trunkId,
          ...callDurationMetadata,
          ...webhookMetadata,
        },
      })
    });
    
    logger.info("Agent dispatch created", {
      ...contextLog,
      room_name: roomName,
      agent_name: resolvedAgentName,
    });

    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "dispatch_success",
      status: "success",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
        webhook_metadata: webhookMetadata,
      },
    });
  } catch (agentErr) {
    // Non-critical: If agent dispatch fails (e.g. older SDK or no explicit dispatch pattern active)
    // we capture but proceed because the explicit Room metadata may already auto-trigger the Agent daemon.
    const errorMsg = agentErr instanceof Error ? agentErr.message : "Unknown error";
    logger.warn("Agent dispatch failed (non-blocking)", {
      ...contextLog,
      error: errorMsg,
      stage: "dispatch_create_failed",
      recovery: "relying on auto-dispatch from room metadata",
    });

    emitCallEvent({
      call_id: request.callId,
      tenant_id: request.tenantId,
      stage: "dispatch_failed",
      status: "failed",
      payload: {
        room_id: roomName,
        agent_name: resolvedAgentName,
        recovery: "relying on auto-dispatch from room metadata",
      },
      error: errorMsg,
    });
  }

  // Stage 3: Create the Outbound SIP Participant bridging the external user into the Room
  try {
    await sipClient.createSipParticipant(
      trunkId,
      formattedPhone,
      roomName,
      {
        participantIdentity: `sip-${request.callId}`,
        participantName: formattedPhone,
        participantMetadata: JSON.stringify({ 
          callId: request.callId, 
          tenantId: request.tenantId, 
          room_id: roomName,
          agent_name: resolvedAgentName,
          direction: request.direction || "outbound",
          trunk_id: trunkId,
          phone_number: formattedPhone,
          ...callDurationMetadata,
          ...webhookMetadata,
        }),
      }
    );
    
    logger.info("SIP participant created", {
      ...contextLog,
      room_name: roomName,
      phone: formattedPhone,
      sip_trunk_id: trunkId,
      participant_identity: `sip-${request.callId}`,
    });
  } catch (sipErr) {
    const errorMsg = sipErr instanceof Error ? sipErr.message : "Unknown error";
    logger.error("SIP participant creation failed", {
      ...contextLog,
      error: errorMsg,
      stage: "sip_participant_create_failed",
      sip_trunk_id: trunkId,
    });
    throw new TelephonyError(
      "sip_participant_create_failed",
      `Failed to create SIP participant: ${errorMsg}`,
      { ...contextLog, error: errorMsg, trunk_id: trunkId }
    );
  }
}
