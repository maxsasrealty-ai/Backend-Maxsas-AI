import { Request, Response } from "express";

import { normalizeBearerToken } from "./auth.jwt";
import {
  getMe,
  logoutSession,
  refreshSession,
  sendOtp,
  verifyMagicLink,
  verifyOtp,
  loginWithPassword,
  sendSignupOtp,
  verifySignupOtp,
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
  loginWithGoogle,
} from "./auth.service";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  resetPasswordSchema,
  sendOtpSchema,
  signupSendSchema,
  signupVerifySchema,
  verifyMagicSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  googleSchema,
} from "./auth.validation";

function getIp(req: Request): string | null {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || null;
}

function getUserAgent(req: Request): string | null {
  return typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
}

function replyError(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

export async function sendOtpController(req: Request, res: Response): Promise<void> {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await sendOtp(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_DELETED") {
      replyError(res, "ACCOUNT_DELETED", "This account has been removed or scheduled for deletion", 410);
      return;
    }

    replyError(res, "OTP_SEND_FAILED", error instanceof Error ? error.message : "Unable to send login code", 500);
  }
}

export async function verifyOtpController(req: Request, res: Response): Promise<void> {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await verifyOtp(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "OTP_VERIFY_FAILED", error instanceof Error ? error.message : "Unable to verify code", 401);
  }
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await loginWithPassword(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "INVALID_CREDENTIALS", error instanceof Error ? error.message : "Unable to login");
  }
}

export async function googleController(req: Request, res: Response): Promise<void> {
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await loginWithGoogle(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "GOOGLE_AUTH_FAILED", error instanceof Error ? error.message : "Unable to authenticate with Google", 401);
  }
}

export async function sendSignupOtpController(req: Request, res: Response): Promise<void> {
  const parsed = signupSendSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await sendSignupOtp(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "OTP_SEND_FAILED", error instanceof Error ? error.message : "Unable to send signup OTP", 400);
  }
}

export async function verifySignupOtpController(req: Request, res: Response): Promise<void> {
  const parsed = signupVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await verifySignupOtp(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(201).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "OTP_VERIFY_FAILED", error instanceof Error ? error.message : "Unable to verify signup OTP", 400);
  }
}

export async function sendPasswordResetOtpController(req: Request, res: Response): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await sendPasswordResetOtp(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "OTP_SEND_FAILED", error instanceof Error ? error.message : "Unable to send password reset OTP", 400);
  }
}

export async function verifyPasswordResetOtpController(req: Request, res: Response): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await verifyPasswordResetOtp(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "PASSWORD_RESET_FAILED", error instanceof Error ? error.message : "Unable to reset password", 400);
  }
}

export async function verifyMagicController(req: Request, res: Response): Promise<void> {
  const body = req.method === "GET" ? req.query : req.body;
  const parsed = verifyMagicSchema.safeParse(body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await verifyMagicLink(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });

    if (parsed.data.redirectTo) {
      const redirectUrl = new URL(parsed.data.redirectTo);
      redirectUrl.hash = `accessToken=${encodeURIComponent(result.accessToken)}&refreshToken=${encodeURIComponent(result.refreshToken)}&tenantId=${encodeURIComponent(result.tenant.id)}&userId=${encodeURIComponent(result.user.id)}`;
      res.redirect(302, redirectUrl.toString());
      return;
    }

    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "MAGIC_LINK_VERIFY_FAILED", error instanceof Error ? error.message : "Unable to verify magic link", 401);
  }
}

export async function refreshController(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await refreshSession(parsed.data, { ipAddress: getIp(req), userAgent: getUserAgent(req) });
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "REFRESH_FAILED", error instanceof Error ? error.message : "Unable to refresh session", 401);
  }
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  const parsed = logoutSchema.safeParse(req.body);
  if (!parsed.success) {
    replyError(res, "INVALID_REQUEST", parsed.error.issues.map((issue) => issue.message).join(", "));
    return;
  }

  try {
    const result = await logoutSession(parsed.data);
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "LOGOUT_FAILED", error instanceof Error ? error.message : "Unable to log out", 500);
  }
}

export async function meController(req: Request, res: Response): Promise<void> {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  const token = authHeader.startsWith("Bearer ") ? normalizeBearerToken(authHeader) : "";

  if (!token) {
    replyError(res, "UNAUTHORIZED", "Missing access token", 401);
    return;
  }

  try {
    const result = await getMe(token);
    res.status(200).json({ success: true, data: result, error: null });
  } catch (error) {
    replyError(res, "UNAUTHORIZED", error instanceof Error ? error.message : "Unable to resolve session", 401);
  }
}
