import { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

const DEFAULT_HEADER_PREFIX = "Bearer ";

export function verifyWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const route = `${req.method || "UNKNOWN"} ${req.originalUrl || req.url || "unknown"}`;
  const expectedToken =
    process.env.VOICE_WEBHOOK_BEARER_TOKEN ||
    process.env.BACKEND_WEBHOOK_TOKEN ||
    process.env.BACKEND_WEBHOOK_AUTH_TOKEN;

  if (!expectedToken) {
    logger.error("Webhook auth configuration missing", {
      route,
      has_authorization_header: Boolean(authHeader),
      remote_ip: req.ip,
    });
    res.status(500).json({
      success: false,
      error: {
        code: "WEBHOOK_TOKEN_NOT_CONFIGURED",
        message: "Voice webhook token is not configured",
      },
    });
    return;
  }

  if (!authHeader || !authHeader.startsWith(DEFAULT_HEADER_PREFIX)) {
    logger.warn("Webhook request rejected: missing bearer token", {
      route,
      has_authorization_header: Boolean(authHeader),
      remote_ip: req.ip,
    });
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Missing bearer token",
      },
    });
    return;
  }

  const token = authHeader.slice(DEFAULT_HEADER_PREFIX.length).trim();

  if (token !== expectedToken) {
    logger.warn("Webhook request rejected: invalid bearer token", {
      route,
      remote_ip: req.ip,
      token_length: token.length,
      expected_length: expectedToken.length,
    });
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid bearer token",
      },
    });
    return;
  }

  logger.info("Webhook auth verified", {
    route,
    remote_ip: req.ip,
  });

  next();
}
