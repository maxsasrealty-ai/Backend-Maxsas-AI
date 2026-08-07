import { createHash } from "crypto";

import { isUuid } from "./uuid";

function toUuidFromHex32(hex32: string): string {
  const chars = hex32.split("");
  chars[12] = "5";
  const variant = parseInt(chars[16], 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);

  const normalized = chars.join("");
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}

export function normalizeTenantId(tenantId: string): string {
  const trimmed = tenantId.trim().toLowerCase();
  if (!trimmed) {
    return tenantId;
  }

  if (isUuid(trimmed)) {
    return trimmed;
  }

  const hex32 = createHash("sha1").update(`tenant:${trimmed}`).digest("hex").slice(0, 32);
  return toUuidFromHex32(hex32);
}
