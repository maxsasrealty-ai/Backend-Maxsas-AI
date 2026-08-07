import { z } from "zod";

const emailSchema = z.string().trim().min(3).max(320).email().transform((value) => value.toLowerCase());
const passwordSchema = z.string().trim().min(8);
const fullNameSchema = z.string().trim().min(2).max(100);

export const sendOtpSchema = z.object({
  email: emailSchema,
  deviceInfo: z.string().trim().max(250).optional(),
  redirectTo: z.string().trim().url().optional(),
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().trim().regex(/^\d{6}$/),
  deviceInfo: z.string().trim().max(250).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signupSendSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema.optional(),
});

export const signupVerifySchema = z.object({
  email: emailSchema,
  otp: z.string().trim().regex(/^\d{6}$/),
  password: passwordSchema,
  fullName: fullNameSchema.optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  otp: z.string().trim().regex(/^\d{6}$/),
  newPassword: passwordSchema,
});

export const verifyMagicSchema = z.object({
  email: emailSchema,
  token: z.string().trim().min(20),
  deviceInfo: z.string().trim().max(250).optional(),
  redirectTo: z.string().trim().url().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(20).optional(),
  sessionId: z.string().trim().uuid().optional(),
  logoutAll: z.boolean().optional(),
});

export const googleSchema = z.object({
  idToken: z.string().trim().min(20),
});
