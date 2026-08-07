import {
    LeadUploadPreviewRequest,
    LeadUploadPreviewResponse,
    ManualLeadPreviewRequest,
} from "../../../../shared/contracts";
import { prisma } from "../../lib/prisma";
import { buildLeadUploadPreview, normalizeManualLeadRow } from "./lead-upload.pipeline";

export async function listLeads(tenantId: string) {
  return prisma.leadExtraction.findMany({
    where: { tenantId },
    orderBy: { extractedAt: "desc" },
  });
}

export async function getLeadById(tenantId: string, leadId: string) {
  return prisma.leadExtraction.findFirst({
    where: {
      id: leadId,
      tenantId,
    },
  });
}

export async function generateLeadUploadPreview(args: {
  tenantId: string;
  payload: LeadUploadPreviewRequest;
}): Promise<LeadUploadPreviewResponse> {
  const result = buildLeadUploadPreview(args.payload);

  console.info("[lead-upload] preview generated", {
    tenantId: args.tenantId,
    totalRows: result.totalRows,
    validRows: result.validRows,
    invalidRows: result.invalidRows,
    duplicateRows: result.duplicateRows,
  });

  return result;
}

export async function generateManualLeadPreview(args: {
  tenantId: string;
  payload: ManualLeadPreviewRequest;
}): Promise<LeadUploadPreviewResponse> {
  const result = normalizeManualLeadRow({
    name: args.payload.name,
    phone: args.payload.phone,
    email: args.payload.email,
    company: args.payload.company,
    city: args.payload.city,
    state: args.payload.state,
    source: args.payload.source,
    ...(args.payload.extra ?? {}),
  });

  console.info("[lead-upload] manual preview generated", {
    tenantId: args.tenantId,
    totalRows: result.totalRows,
    validRows: result.validRows,
    invalidRows: result.invalidRows,
    duplicateRows: result.duplicateRows,
  });

  return result;
}
