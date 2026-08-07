import { randomBytes, scryptSync } from "crypto";

import { prisma } from "../lib/prisma";

const DEFAULT_DEV_EMAIL = (process.env.DEV_AUTH_EMAIL || "admin@maxsas.com").trim().toLowerCase();
const DEFAULT_DEV_PASSWORD = process.env.DEV_AUTH_PASSWORD || "Admin@123456";
const DEFAULT_DEV_FULL_NAME = process.env.DEV_AUTH_FULL_NAME || "Maxsas Admin";
const DEFAULT_DEV_TENANT_ID = process.env.DEV_AUTH_TENANT_ID || "cf063f44-f7b4-5d8c-811f-2e093bed8cb1";
const DEFAULT_DEV_TENANT_NAME = process.env.DEV_AUTH_TENANT_NAME || "Maxsas Realty";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function isDevLoginEmail(email: string): boolean {
  return email.trim().toLowerCase() === DEFAULT_DEV_EMAIL;
}

export function getDevAuthPassword(): string {
  return DEFAULT_DEV_PASSWORD;
}

export async function ensureDevAuthUser(): Promise<void> {
  if (process.env.APP_ENV === "production") {
    return;
  }

  const tenant = await prisma.tenant.upsert({
    where: { id: DEFAULT_DEV_TENANT_ID },
    update: {
      name: DEFAULT_DEV_TENANT_NAME,
    },
    create: {
      id: DEFAULT_DEV_TENANT_ID,
      name: DEFAULT_DEV_TENANT_NAME,
    },
  });

  await prisma.user.upsert({
    where: { email: DEFAULT_DEV_EMAIL },
    update: {
      fullName: DEFAULT_DEV_FULL_NAME,
      tenantId: tenant.id,
    },
    create: {
      fullName: DEFAULT_DEV_FULL_NAME,
      email: DEFAULT_DEV_EMAIL,
      passwordHash: hashPassword(DEFAULT_DEV_PASSWORD),
      tenantId: tenant.id,
    },
  });
}
