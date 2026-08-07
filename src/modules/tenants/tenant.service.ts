import { prisma } from "../../lib/db";

export async function ensureTenant(tenantId: string) {
  return prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: {
      id: tenantId,
      name: tenantId,
    },
  });
}
