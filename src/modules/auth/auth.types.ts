import type { AuthSessionUser } from "../../../shared/contracts";
import type { PlanCapabilities } from "../../../shared/contracts/plans";

export type AuthRole = "member" | "owner" | "admin";

export interface AuthTenantContext {
  id: string;
  name: string | null;
  plan: string;
  capabilities: PlanCapabilities;
}

export interface AuthRequestContext extends AuthSessionUser {
  role: AuthRole;
  sessionId: string;
  tenant: AuthTenantContext;
}

export interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  role: AuthRole;
  email: string;
  sid: string;
  jti: string;
  tokenType: "access" | "refresh";
}

export interface AuthChallengeResult {
  email: string;
  maskedEmail: string;
  otpExpiresAt: string;
  magicLinkExpiresAt: string;
  cooldownSeconds: number;
}

export interface AuthLoginResult {
  user: AuthSessionUser & { role: AuthRole };
  tenant: AuthTenantContext;
  capabilities: PlanCapabilities;
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
}

export interface AuthMeResult {
  user: AuthSessionUser & { role: AuthRole };
  tenant: AuthTenantContext;
  capabilities: PlanCapabilities;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  sessionId: string;
}
