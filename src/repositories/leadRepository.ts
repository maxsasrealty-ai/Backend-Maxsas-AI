import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { assertUuid } from "../lib/uuid";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Upsert a lead extraction record.
 * Field names match the actual agent payload:
 *   - preferredLocation (from lead_extracted.preferred_location or call_analysis_completed.lead.location)
 *   - budgetRange       (from lead_extracted.budget_range or call_analysis_completed.lead.budget)
 *   - timeline         (from purchase_timeline or call_analysis_completed.lead.timeline)
 */
export async function upsertLeadExtraction(args: {
  callId: string;
  tenantId: string;
  extractedAt: Date;
  name?: string | null;
  phone?: string | null;
  summary?: string | null;
  confidence?: number | null;
  propertyType?: string | null;
  preferredLocation?: string | null;
  budgetRange?: string | null;
  timeline?: string | null;
  rawJson?: Prisma.InputJsonValue;
  db?: DbClient;
}) {
  assertUuid(args.callId, "callId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  const existing = await db.leadExtraction.findFirst({
    where: { callId: args.callId, tenantId: args.tenantId },
    select: { id: true },
  });

  const data = {
    extractedAt: args.extractedAt,
    name: args.name,
    phone: args.phone,
    summary: args.summary,
    confidence: args.confidence,
    propertyType: args.propertyType,
    preferredLocation: args.preferredLocation,
    budgetRange: args.budgetRange,
    timeline: args.timeline,
    rawJson: args.rawJson,
  };

  if (existing) {
    await db.leadExtraction.updateMany({
      where: { id: existing.id, tenantId: args.tenantId },
      data,
    });
    return db.leadExtraction.findFirst({
      where: { id: existing.id, tenantId: args.tenantId },
    });
  }

  return db.leadExtraction.create({
    data: {
      callId: args.callId,
      tenantId: args.tenantId,
      ...data,
    },
  });
}

export async function getLeadExtractionByCallId(callId: string, tenantId: string) {
  assertUuid(callId, "callId");
  assertUuid(tenantId, "tenantId");

  return prisma.leadExtraction.findFirst({
    where: { callId, tenantId },
  });
}
