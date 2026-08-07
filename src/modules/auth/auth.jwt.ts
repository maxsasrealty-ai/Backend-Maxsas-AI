import { createHash, randomUUID } from "crypto";
import jwt from "jsonwebtoken";

import { config } from "../../lib/config";
import type { AuthRole, AuthTokenPayload } from "./auth.types";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function nextJwtId(): string {
  return randomUUID();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeBearerToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, "");
}

function signToken(
  payload: Omit<AuthTokenPayload, "jti" | "tokenType"> & { tokenType: AuthTokenPayload["tokenType"] },
  secret: string,
  expiresInSeconds: number
): string {
  return jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
      sid: payload.sid,
      tokenType: payload.tokenType,
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: expiresInSeconds,
      subject: payload.userId,
      jwtid: nextJwtId(),
    }
  );
}

export function signAccessToken(payload: Omit<AuthTokenPayload, "jti" | "tokenType">): string {
  return signToken({ ...payload, tokenType: "access" }, config.accessTokenSecret, ACCESS_TOKEN_TTL_SECONDS);
}

export function signRefreshToken(payload: Omit<AuthTokenPayload, "jti" | "tokenType">): string {
  return signToken({ ...payload, tokenType: "refresh" }, config.refreshTokenSecret, REFRESH_TOKEN_TTL_SECONDS);
}

function verifyToken(token: string, secret: string): AuthTokenPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  if (decoded.tokenType !== "access" && decoded.tokenType !== "refresh") {
    throw new Error("Invalid token type");
  }

  return {
    userId: String(decoded.userId || ""),
    tenantId: String(decoded.tenantId || ""),
    role: String(decoded.role || "member") as AuthRole,
    email: String(decoded.email || ""),
    sid: String(decoded.sid || ""),
    jti: String(decoded.jti || ""),
    tokenType: decoded.tokenType,
  };
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return verifyToken(token, config.accessTokenSecret);
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return verifyToken(token, config.refreshTokenSecret);
}
