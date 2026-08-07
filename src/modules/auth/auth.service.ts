import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";

import IORedis from "ioredis";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { z } from "zod";

import { getCachedTenantCapabilities, getPlanCapabilities, getWorkspaceConfigForPlan } from "../../services/accessService";
import { config } from "../../lib/config";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { sendAuthEmail } from "./auth.email";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, hashToken, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "./auth.jwt";
import type { AuthChallengeResult, AuthLoginResult, AuthMeResult, AuthRole, AuthRequestContext } from "./auth.types";
import { loginSchema, logoutSchema, refreshSchema, sendOtpSchema, signupSendSchema, signupVerifySchema, forgotPasswordSchema, resetPasswordSchema, verifyMagicSchema, verifyOtpSchema } from "./auth.validation";

type SendOtpInput = z.infer<typeof sendOtpSchema>;
type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
type VerifyMagicInput = z.infer<typeof verifyMagicSchema>;
type LoginInput = z.infer<typeof loginSchema>;
type SendSignupInput = z.infer<typeof signupSendSchema>;
type SignupVerifyInput = z.infer<typeof signupVerifySchema>;
type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
type RefreshInput = z.infer<typeof refreshSchema>;
type LogoutInput = z.infer<typeof logoutSchema>;

const OTP_EXPIRY_MINUTES = 5;
const MAGIC_LINK_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;
const OTP_VERIFICATION_ATTEMPTS_LIMIT = 5;

const redisDisabled =
  process.env.REDIS_DISABLED === "true" ||
  (process.env.APP_ENV !== "production" && process.env.REDIS_DISABLED !== "false");

const redisConnection = redisDisabled
  ? null
  : new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

if (redisConnection) {
  redisConnection.on("error", (error) => {
    logger.warn("Auth Redis connection error", { message: error.message });
  });
}

function buildLimiter(points: number, durationSeconds: number, prefix: string) {
  if (redisConnection) {
    return new RateLimiterRedis({ storeClient: redisConnection, keyPrefix: prefix, points, duration: durationSeconds });
  }

  return new RateLimiterMemory({ keyPrefix: prefix, points, duration: durationSeconds });
}

const sendOtpIpLimiter = buildLimiter(3, 60, "auth_send_ip");
const sendOtpEmailLimiter = buildLimiter(3, 60, "auth_send_email");
const verifyOtpIpLimiter = buildLimiter(5, 60, "auth_verify_ip");
const verifyOtpEmailLimiter = buildLimiter(5, 60, "auth_verify_email");

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return email;
  }

  return `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, localPart.length - 2))}@${domain}`;
}

function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  return String(Math.floor(Math.random() * max)).padStart(OTP_LENGTH, "0");
}

function getRequestIp(request: { headers: Record<string, unknown>; ip?: string }): string | null {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.ip || null;
}

function buildDeviceInfo(input?: string | null, userAgent?: string | null): string {
  const parts = [input?.trim(), userAgent?.trim()].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" | ") : "Unknown device";
}

function normalizeRole(role: string | null | undefined): AuthRole {
  if (role === "admin" || role === "owner") {
    return role;
  }

  return "member";
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derivedHash, "hex"));
}

function buildTenantContext(tenant: { id: string; name: string | null; plan: string }): AuthRequestContext["tenant"] {
  const plan = (tenant.plan as Parameters<typeof getPlanCapabilities>[0]) || "basic";
  return {
    id: tenant.id,
    name: tenant.name,
    plan: tenant.plan,
    capabilities: getPlanCapabilities(plan),
  };
}

async function ensureActiveUser(email: string) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      avatar: true,
      provider: true,
      role: true,
      tenantId: true,
      deletedAt: true,
      deletionStatus: true,
      tenant: { select: { id: true, name: true, plan: true, deletedAt: true, deletionStatus: true } },
    },
  });

  if (!existingUser) {
    throw new Error("USER_NOT_FOUND");
  }

  if (existingUser.deletedAt || existingUser.deletionStatus !== "active") {
    throw new Error("ACCOUNT_DELETED");
  }

  if ((existingUser.tenant as any).deletedAt || (existingUser.tenant as any).deletionStatus !== "active") {
    throw new Error("ACCOUNT_DELETED");
  }

  return existingUser;
}

async function createTenantAndUser(email: string, passwordHash: string, fullName?: string) {
  const localPart = email.split("@")[0] || "user";
  const suggestedName = fullName?.trim() ||
    localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") ||
    "Maxsas User";

  const createdTenant = await prisma.tenant.create({
    data: {
      name: `${suggestedName || "Maxsas"} Workspace`,
      plan: "basic",
      capabilitiesJson: getPlanCapabilities("basic").features,
      workspaceConfigJson: JSON.parse(JSON.stringify(getWorkspaceConfigForPlan("basic", { tenantDisplayName: suggestedName || email }))),
    },
  });

  const createdUser = await prisma.user.create({
    data: {
      email,
      fullName: suggestedName,
      tenantId: createdTenant.id,
      role: "owner",
      passwordHash,
    },
    include: { tenant: true },
  });

  return { user: createdUser, tenant: createdTenant };
}

async function createSessionForUser(args: {
  user: { id: string; email: string; fullName: string; tenantId: string; role: string; tenant: { id: string; name: string | null; plan: string } };
  deviceInfo?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AuthLoginResult> {
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken({
    userId: args.user.id,
    tenantId: args.user.tenantId,
    role: normalizeRole(args.user.role),
    email: args.user.email,
    sid: sessionId,
  });
  const accessToken = signAccessToken({
    userId: args.user.id,
    tenantId: args.user.tenantId,
    role: normalizeRole(args.user.role),
    email: args.user.email,
    sid: sessionId,
  });

  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.authSession.create({
      data: {
        id: sessionId,
        userId: args.user.id,
        refreshTokenHash,
        deviceInfo: buildDeviceInfo(args.deviceInfo, args.userAgent),
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
        expiresAt,
      },
    });

    await tx.refreshToken.create({
      data: {
        sessionId,
        userId: args.user.id,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });
  });

  const tenantContext = buildTenantContext(args.user.tenant);
  const capabilities = (await getCachedTenantCapabilities(args.user.tenantId)).capabilities;

  return {
    user: {
      id: args.user.id,
      email: args.user.email,
      fullName: args.user.fullName,
      tenantId: args.user.tenantId,
      role: normalizeRole(args.user.role),
    },
    tenant: {
      ...tenantContext,
      capabilities,
    },
    capabilities,
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    sessionId,
  };
}

async function loadLatestOtp(email: string) {
  return prisma.emailOtp.findFirst({
    where: {
      email,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function loadMagicToken(email: string, token: string) {
  return prisma.magicToken.findFirst({
    where: {
      email,
      tokenHash: hashToken(token),
      used: false,
      expiresAt: { gt: new Date() },
    },
  });
}

export async function loginWithPassword(input: LoginInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthLoginResult> {
  const email = normalizeEmail(input.email);
  const user = await ensureActiveUser(email);

  if (!verifyPassword(input.password, user.passwordHash)) {
    throw new Error("INVALID_CREDENTIALS");
  }

  return createSessionForUser({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      role: user.role,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        plan: user.tenant.plan,
      },
    },
    deviceInfo: undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function loginWithGoogle(
  input: { idToken: string },
  meta: { ipAddress: string | null; userAgent: string | null }
): Promise<AuthLoginResult> {
  const idToken = input.idToken;

  let payload: any;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const bodyText = await res.text();
    if (!res.ok) {
      const extra = bodyText ? ` (${bodyText})` : "";
      throw new Error(`GOOGLE_TOKENINFO_FAILED: ${res.status}${extra}`);
    }

    try {
      payload = JSON.parse(bodyText || "{}");
    } catch (parseErr) {
      throw new Error("GOOGLE_TOKENINFO_INVALID_JSON");
    }
  } catch (err) {
    logger.warn("Google token verification failed", { message: err instanceof Error ? err.message : String(err) });
    throw new Error("INVALID_GOOGLE_TOKEN");
  }

  // If configured, validate audience matches our Google client id
  if (config.googleClientId && typeof payload.aud === "string" && payload.aud !== config.googleClientId) {
    logger.warn("Google token audience mismatch", { expected: config.googleClientId, got: payload.aud });
    throw new Error("GOOGLE_AUD_MISMATCH");
  }

  const googleId = typeof payload.sub === "string" ? payload.sub : null;
  const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : null;
  const fullName = typeof payload.name === "string" ? payload.name : undefined;
  const avatar = typeof payload.picture === "string" ? payload.picture : undefined;

  if (!googleId || !email) {
    throw new Error("INVALID_GOOGLE_TOKEN");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatar: true,
      provider: true,
      role: true,
      tenantId: true,
      deletedAt: true,
      deletionStatus: true,
      tenant: { select: { id: true, name: true, plan: true, deletedAt: true, deletionStatus: true } },
    },
  });

  if (existingUser) {
    if (existingUser.deletedAt || existingUser.deletionStatus !== "active") {
      throw new Error("ACCOUNT_DELETED");
    }

    if ((existingUser.tenant as any).deletedAt || (existingUser.tenant as any).deletionStatus !== "active") {
      throw new Error("ACCOUNT_DELETED");
    }

    // If user exists but has no googleId, attach it.
    if (!existingUser.provider || existingUser.provider !== "google") {
      // Attempt to persist googleId/provider/avatar if the DB column exists; if not, skip
      try {
        await prisma.user.update({ where: { id: existingUser.id }, data: { provider: "google", avatar: avatar || existingUser.avatar } });
      } catch (err) {
        logger.warn("Could not update user google metadata; maybe DB column missing", { err: err instanceof Error ? err.message : String(err) });
      }
    }

    return createSessionForUser({
      user: {
        id: existingUser.id,
        email: existingUser.email,
        fullName: existingUser.fullName,
        tenantId: existingUser.tenantId,
        role: existingUser.role,
        tenant: {
          id: existingUser.tenant.id,
          name: existingUser.tenant.name,
          plan: existingUser.tenant.plan,
        },
      },
      deviceInfo: undefined,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  // Create new tenant and user for this Google account
  const passwordHash = hashPassword(randomBytes(16).toString("hex"));
  const created = await createTenantAndUser(email, passwordHash, fullName);

  // Attempt to update created user to set provider/avatar (googleId column may not exist yet)
  try {
    await prisma.user.update({ where: { id: created.user.id }, data: { provider: "google", avatar: avatar || created.user.avatar } });
  } catch (err) {
    logger.warn("Could not update new user google metadata; maybe DB column missing", { err: err instanceof Error ? err.message : String(err) });
  }

  return createSessionForUser({
    user: {
      id: created.user.id,
      email: created.user.email,
      fullName: created.user.fullName,
      tenantId: created.user.tenantId,
      role: created.user.role,
      tenant: {
        id: created.tenant.id,
        name: created.tenant.name,
        plan: created.tenant.plan,
      },
    },
    deviceInfo: undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function sendSignupOtp(input: SendSignupInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthChallengeResult> {
  const email = normalizeEmail(input.email);
  await sendOtpIpLimiter.consume(meta.ipAddress || email);
  await sendOtpEmailLimiter.consume(email);

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const otp = generateOtp();
  const otpHash = hashToken(otp);
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: {
      email,
      otpHash,
      expiresAt: otpExpiresAt,
      attempts: 0,
      verified: false,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  await sendAuthEmail({
    email,
    otp,
    subject: "Verify your email to create your Maxsas account",
    expiresMinutes: OTP_EXPIRY_MINUTES,
  });

  return {
    email,
    maskedEmail: maskEmail(email),
    otpExpiresAt: otpExpiresAt.toISOString(),
    magicLinkExpiresAt: "",
    cooldownSeconds: 60,
  };
}

export async function verifySignupOtp(input: SignupVerifyInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthLoginResult> {
  const email = normalizeEmail(input.email);
  await verifyOtpIpLimiter.consume(meta.ipAddress || email);
  await verifyOtpEmailLimiter.consume(email);

  const challenge = await loadLatestOtp(email);
  if (!challenge) {
    throw new Error("OTP_NOT_FOUND");
  }

  if (challenge.attempts >= OTP_VERIFICATION_ATTEMPTS_LIMIT) {
    throw new Error("OTP_TOO_MANY_ATTEMPTS");
  }

  const otpHash = hashToken(input.otp);
  if (otpHash !== challenge.otpHash) {
    await prisma.emailOtp.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new Error("OTP_INVALID");
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = hashPassword(input.password);
  const { user } = await createTenantAndUser(email, passwordHash, input.fullName);

  await prisma.emailOtp.update({
    where: { id: challenge.id },
    data: {
      verified: true,
      verifiedAt: new Date(),
      verificationIpAddress: meta.ipAddress,
      verificationUserAgent: meta.userAgent,
    },
  });

  return createSessionForUser({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      role: user.role,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        plan: user.tenant.plan,
      },
    },
    deviceInfo: meta.userAgent,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function sendPasswordResetOtp(input: ForgotPasswordInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthChallengeResult> {
  const email = normalizeEmail(input.email);
  await sendOtpIpLimiter.consume(meta.ipAddress || email);
  await sendOtpEmailLimiter.consume(email);

  const user = await ensureActiveUser(email);
  const otp = generateOtp();
  const otpHash = hashToken(otp);
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: {
      email,
      otpHash,
      expiresAt: otpExpiresAt,
      attempts: 0,
      verified: false,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  await sendAuthEmail({
    email,
    otp,
    subject: "Reset your Maxsas Realty password",
    expiresMinutes: OTP_EXPIRY_MINUTES,
  });

  return {
    email,
    maskedEmail: maskEmail(email),
    otpExpiresAt: otpExpiresAt.toISOString(),
    magicLinkExpiresAt: "",
    cooldownSeconds: 60,
  };
}

export async function verifyPasswordResetOtp(input: ResetPasswordInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<{ success: boolean }> {
  const email = normalizeEmail(input.email);
  await verifyOtpIpLimiter.consume(meta.ipAddress || email);
  await verifyOtpEmailLimiter.consume(email);

  const challenge = await loadLatestOtp(email);
  if (!challenge) {
    throw new Error("OTP_NOT_FOUND");
  }

  if (challenge.attempts >= OTP_VERIFICATION_ATTEMPTS_LIMIT) {
    throw new Error("OTP_TOO_MANY_ATTEMPTS");
  }

  const otpHash = hashToken(input.otp);
  if (otpHash !== challenge.otpHash) {
    await prisma.emailOtp.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new Error("OTP_INVALID");
  }

  const user = await ensureActiveUser(email);
  const passwordHash = hashPassword(input.newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.emailOtp.update({
      where: { id: challenge.id },
      data: {
        verified: true,
        verifiedAt: now,
        verificationIpAddress: meta.ipAddress,
        verificationUserAgent: meta.userAgent,
      },
    }),
    prisma.user.update({
      where: { email },
      data: { passwordHash },
    }),
    prisma.authSession.updateMany({
      where: { userId: user.id, revoked: false },
      data: { revoked: true, revokedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revoked: false },
      data: { revoked: true, revokedAt: now },
    }),
  ]);

  return { success: true };
}

export async function sendOtp(input: SendOtpInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthChallengeResult> {
  const email = normalizeEmail(input.email);
  await sendOtpIpLimiter.consume(meta.ipAddress || email);
  await sendOtpEmailLimiter.consume(email);

  const user = await ensureActiveUser(email);
  const otp = generateOtp();
  const otpHash = hashToken(otp);
  const magicToken = randomBytes(32).toString("hex");
  const magicTokenHash = hashToken(magicToken);
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const magicExpiresAt = new Date(now.getTime() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.emailOtp.create({
      data: {
        email,
        otpHash,
        expiresAt: otpExpiresAt,
        attempts: 0,
        verified: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    await tx.magicToken.create({
      data: {
        email,
        tokenHash: magicTokenHash,
        expiresAt: magicExpiresAt,
        used: false,
      },
    });
  });

  const baseUrl = config.API_BASE_URL.replace(/\/$/, "");
  const magicLinkUrl = `${baseUrl}/api/auth/magic/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(magicToken)}${input.redirectTo ? `&redirectTo=${encodeURIComponent(input.redirectTo)}` : ""}`;

  await sendAuthEmail({
    email,
    otp,
    magicLinkUrl,
    subject: "Your Maxsas Realty login code",
    expiresMinutes: MAGIC_LINK_EXPIRY_MINUTES,
  });

  logger.info("Auth challenge issued", {
    email,
    tenantId: user.tenantId,
    ipAddress: meta.ipAddress,
  });

  return {
    email,
    maskedEmail: maskEmail(email),
    otpExpiresAt: otpExpiresAt.toISOString(),
    magicLinkExpiresAt: magicExpiresAt.toISOString(),
    cooldownSeconds: 60,
  };
}

export async function verifyOtp(input: VerifyOtpInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthLoginResult> {
  const email = normalizeEmail(input.email);
  await verifyOtpIpLimiter.consume(meta.ipAddress || email);
  await verifyOtpEmailLimiter.consume(email);

  const challenge = await loadLatestOtp(email);
  if (!challenge) {
    throw new Error("OTP_NOT_FOUND");
  }

  if (challenge.attempts >= OTP_VERIFICATION_ATTEMPTS_LIMIT) {
    throw new Error("OTP_TOO_MANY_ATTEMPTS");
  }

  const otpHash = hashToken(input.otp);
  if (otpHash !== challenge.otpHash) {
    await prisma.emailOtp.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new Error("OTP_INVALID");
  }

  const user = await ensureActiveUser(email);

  await prisma.$transaction(async (tx) => {
    await tx.emailOtp.update({
      where: { id: challenge.id },
      data: {
        verified: true,
        verifiedAt: new Date(),
        verificationIpAddress: meta.ipAddress,
        verificationUserAgent: meta.userAgent,
      },
    });

    await tx.magicToken.updateMany({
      where: {
        email,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: {
        used: true,
        usedAt: new Date(),
        usedIpAddress: meta.ipAddress,
        usedUserAgent: meta.userAgent,
      },
    });
  });

  return createSessionForUser({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      role: user.role,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        plan: user.tenant.plan,
      },
    },
    deviceInfo: input.deviceInfo,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function verifyMagicLink(input: VerifyMagicInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthLoginResult> {
  const email = normalizeEmail(input.email);
  const magicToken = await loadMagicToken(email, input.token);
  if (!magicToken) {
    throw new Error("MAGIC_TOKEN_INVALID");
  }

  const user = await ensureActiveUser(email);

  await prisma.$transaction(async (tx) => {
    await tx.magicToken.update({
      where: { id: magicToken.id },
      data: {
        used: true,
        usedAt: new Date(),
        usedIpAddress: meta.ipAddress,
        usedUserAgent: meta.userAgent,
      },
    });

    await tx.magicToken.updateMany({
      where: {
        email,
        used: false,
        expiresAt: { gt: new Date() },
        id: { not: magicToken.id },
      },
      data: {
        used: true,
        usedAt: new Date(),
        usedIpAddress: meta.ipAddress,
        usedUserAgent: meta.userAgent,
      },
    });

    await tx.emailOtp.updateMany({
      where: {
        email,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      data: {
        verified: true,
        verifiedAt: new Date(),
        verificationIpAddress: meta.ipAddress,
        verificationUserAgent: meta.userAgent,
      },
    });
  });

  return createSessionForUser({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: user.tenantId,
      role: user.role,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        plan: user.tenant.plan,
      },
    },
    deviceInfo: input.deviceInfo,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function refreshSession(input: RefreshInput, meta: { ipAddress: string | null; userAgent: string | null }): Promise<AuthLoginResult> {
  const payload = verifyRefreshToken(input.refreshToken);
  const refreshTokenHash = hashToken(input.refreshToken);

  const session = await prisma.authSession.findUnique({
    where: { id: payload.sid },
    select: {
      id: true,
      revoked: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          tenantId: true,
          role: true,
          tenant: { select: { id: true, name: true, plan: true, deletedAt: true, deletionStatus: true } },
        },
      },
    },
  });

  if (!session || session.revoked || session.expiresAt <= new Date()) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const storedToken = await prisma.refreshToken.findUnique({ where: { tokenHash: refreshTokenHash } });
  if (!storedToken || storedToken.revoked || storedToken.sessionId !== session.id) {
    throw new Error("REFRESH_TOKEN_INVALID");
  }

  const nextRefreshToken = signRefreshToken({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: normalizeRole(session.user.role),
    email: session.user.email,
    sid: session.id,
  });
  const nextRefreshTokenHash = hashToken(nextRefreshToken);
  const nextAccessToken = signAccessToken({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: normalizeRole(session.user.role),
    email: session.user.email,
    sid: session.id,
  });
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { tokenHash: refreshTokenHash },
      data: {
        revoked: true,
        revokedAt: new Date(),
        replacedByTokenHash: nextRefreshTokenHash,
      },
    });

    await tx.refreshToken.create({
      data: {
        sessionId: session.id,
        userId: session.user.id,
        tokenHash: nextRefreshTokenHash,
        expiresAt,
      },
    });

    await tx.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: nextRefreshTokenHash,
        lastUsedAt: new Date(),
        ipAddress: meta.ipAddress ?? session.ipAddress,
        userAgent: meta.userAgent ?? session.userAgent,
        expiresAt,
      },
    });
  });

  const tenantContext = buildTenantContext(session.user.tenant);
  const capabilities = (await getCachedTenantCapabilities(session.user.tenantId)).capabilities;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      tenantId: session.user.tenantId,
      role: normalizeRole(session.user.role),
    },
    tenant: {
      ...tenantContext,
      capabilities,
    },
    capabilities,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    sessionId: session.id,
  };
}

export async function logoutSession(input: LogoutInput): Promise<{ revokedSessions: number; revokedTokens: number }> {
  const now = new Date();

  if (input.logoutAll && input.refreshToken) {
    const payload = verifyRefreshToken(input.refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    if (!user) {
      return { revokedSessions: 0, revokedTokens: 0 };
    }

    const [sessionResult, tokenResult] = await prisma.$transaction([
      prisma.authSession.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true, revokedAt: now },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true, revokedAt: now },
      }),
    ]);

    return { revokedSessions: sessionResult.count, revokedTokens: tokenResult.count };
  }

  if (input.sessionId) {
    const session = await prisma.authSession.findUnique({ where: { id: input.sessionId }, select: { id: true } });
    if (!session) {
      return { revokedSessions: 0, revokedTokens: 0 };
    }

    const tokenResult = await prisma.refreshToken.updateMany({
      where: { sessionId: session.id, revoked: false },
      data: { revoked: true, revokedAt: now },
    });

    await prisma.authSession.update({
      where: { id: session.id },
      data: { revoked: true, revokedAt: now },
    });

    return { revokedSessions: 1, revokedTokens: tokenResult.count };
  }

  if (!input.refreshToken) {
    return { revokedSessions: 0, revokedTokens: 0 };
  }

  const payload = verifyRefreshToken(input.refreshToken);
  const refreshTokenHash = hashToken(input.refreshToken);
  const session = await prisma.authSession.findUnique({ where: { id: payload.sid }, select: { id: true, revoked: true, expiresAt: true } });

  if (!session) {
    return { revokedSessions: 0, revokedTokens: 0 };
  }

  const [sessionResult, tokenResult, refreshTokenResult] = await prisma.$transaction([
    prisma.authSession.updateMany({
      where: { id: session.id, revoked: false },
      data: { revoked: true, revokedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId: session.id, revoked: false },
      data: { revoked: true, revokedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { tokenHash: refreshTokenHash, revoked: false },
      data: { revoked: true, revokedAt: now },
    }),
  ]);

  return { revokedSessions: sessionResult.count || 0, revokedTokens: (tokenResult.count || 0) + (refreshTokenResult.count || 0) };
}

export async function getAuthContextFromAccessToken(token: string): Promise<AuthRequestContext> {
  const payload = verifyAccessToken(token);
  const session = await prisma.authSession.findUnique({
    where: { id: payload.sid },
    select: {
      id: true,
      revoked: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          tenantId: true,
          role: true,
          tenant: { select: { id: true, name: true, plan: true, deletedAt: true, deletionStatus: true } },
        },
      },
    },
  });

  if (!session || session.revoked || session.expiresAt <= new Date()) {
    throw new Error("SESSION_INVALID");
  }

  const tenantContext = buildTenantContext(session.user.tenant);
  const capabilities = (await getCachedTenantCapabilities(session.user.tenantId)).capabilities;

  return {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    tenantId: session.user.tenantId,
    role: normalizeRole(session.user.role),
    sessionId: session.id,
    tenant: {
      ...tenantContext,
      capabilities,
    },
  };
}

export async function getMe(token: string): Promise<AuthMeResult> {
  const context = await getAuthContextFromAccessToken(token);
  return {
    user: {
      id: context.id,
      email: context.email,
      fullName: context.fullName,
      tenantId: context.tenantId,
      role: context.role,
    },
    tenant: context.tenant,
    capabilities: context.tenant.capabilities,
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    sessionId: context.sessionId,
  };
}
