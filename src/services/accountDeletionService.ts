import { createHash, randomBytes } from "crypto";

import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export type AccountDeletionRequestKind = "account" | "data";
export type AccountDeletionRequestStatus =
  | "pending"
  | "processing"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "purged"
  | "failed"
  | "restored";

export interface DeletionScope {
  includeCalls: boolean;
  includeTranscripts: boolean;
  includeLeads: boolean;
  includeCampaignContacts: boolean;
  includeCampaignLinks: boolean;
  includeOutboundRequests: boolean;
  includeUsageRecords: boolean;
}

export interface DeletionRequestContext {
  tenantId: string;
  requestKind: AccountDeletionRequestKind;
  reason?: string;
  requestedByUserId?: string | null;
  requestedByEmail?: string | null;
  scope?: Partial<DeletionScope> | null;
  retentionDays?: number;
  restoreWindowDays?: number;
}

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_RESTORE_WINDOW_DAYS = 7;

function clampDays(value: number | undefined, fallback: number): number {
  const next = Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
  return Math.min(Math.max(next, 1), 365);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildTrackingToken(): string {
  return randomBytes(24).toString("hex");
}

function serializeScope(scope: Partial<DeletionScope>): Prisma.InputJsonValue {
  return {
    includeCalls: Boolean(scope.includeCalls),
    includeTranscripts: Boolean(scope.includeTranscripts),
    includeLeads: Boolean(scope.includeLeads),
    includeCampaignContacts: Boolean(scope.includeCampaignContacts),
    includeCampaignLinks: Boolean(scope.includeCampaignLinks),
    includeOutboundRequests: Boolean(scope.includeOutboundRequests),
    includeUsageRecords: Boolean(scope.includeUsageRecords),
  } satisfies Record<string, boolean> as Prisma.InputJsonValue;
}

function defaultAccountScope(): DeletionScope {
  return {
    includeCalls: true,
    includeTranscripts: true,
    includeLeads: true,
    includeCampaignContacts: true,
    includeCampaignLinks: true,
    includeOutboundRequests: true,
    includeUsageRecords: true,
  };
}

function defaultDataScope(): DeletionScope {
  return {
    includeCalls: true,
    includeTranscripts: true,
    includeLeads: true,
    includeCampaignContacts: true,
    includeCampaignLinks: true,
    includeOutboundRequests: true,
    includeUsageRecords: false,
  };
}

function normalizeScope(kind: AccountDeletionRequestKind, scope?: Partial<DeletionScope> | null): DeletionScope {
  const defaults = kind === "account" ? defaultAccountScope() : defaultDataScope();
  return {
    includeCalls: scope?.includeCalls ?? defaults.includeCalls,
    includeTranscripts: scope?.includeTranscripts ?? defaults.includeTranscripts,
    includeLeads: scope?.includeLeads ?? defaults.includeLeads,
    includeCampaignContacts: scope?.includeCampaignContacts ?? defaults.includeCampaignContacts,
    includeCampaignLinks: scope?.includeCampaignLinks ?? defaults.includeCampaignLinks,
    includeOutboundRequests: scope?.includeOutboundRequests ?? defaults.includeOutboundRequests,
    includeUsageRecords: scope?.includeUsageRecords ?? defaults.includeUsageRecords,
  };
}

async function writeAuditEntry(args: {
  tenantId?: string | null;
  requestId?: string | null;
  action: string;
  actor?: string | null;
  summary: string;
  details?: Record<string, unknown>;
}) {
  await prisma.accountDeletionAuditEntry.create({
    data: {
      tenantId: args.tenantId || null,
      requestId: args.requestId || null,
      action: args.action,
      actor: args.actor || null,
      summary: args.summary,
      detailsJson: args.details as Prisma.InputJsonValue | undefined,
    },
  });
}

async function getLatestDeletionRequest(tenantId: string) {
  return prisma.accountDeletionRequest.findFirst({
    where: { tenantId },
    orderBy: { requestedAt: "desc" },
  });
}

async function loadDeletionRequestById(requestId: string) {
  return prisma.accountDeletionRequest.findUnique({
    where: { id: requestId },
  });
}

export async function requestDeletion(args: DeletionRequestContext) {
  const retentionDays = clampDays(args.retentionDays, DEFAULT_RETENTION_DAYS);
  const restoreWindowDays = clampDays(args.restoreWindowDays, DEFAULT_RESTORE_WINDOW_DAYS);
  const requestToken = buildTrackingToken();
  const tokenHash = sha256(requestToken);
  const scope = normalizeScope(args.requestKind, args.scope);
  const requestedAt = new Date();
  const scheduledFor = new Date(requestedAt.getTime() + restoreWindowDays * 24 * 60 * 60 * 1000);
  const purgeAfter = new Date(requestedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  const status = args.requestKind === "account" ? "scheduled" : "completed";

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.accountDeletionRequest.create({
      data: {
        tenantId: args.tenantId,
        requestKind: args.requestKind,
        status,
        requestedByUserId: args.requestedByUserId || null,
        requestedByEmail: args.requestedByEmail || null,
        reason: args.reason || null,
        scopeJson: serializeScope(scope),
        requestedAt,
        scheduledFor: args.requestKind === "account" ? scheduledFor : null,
        restoreUntil: args.requestKind === "account" ? scheduledFor : null,
        completedAt: args.requestKind === "data" ? requestedAt : null,
        purgeExecutedAt: null,
        publicTrackingTokenHash: tokenHash,
        publicTrackingTokenHint: requestToken.slice(-6),
        retentionDays,
        restoreWindowDays,
        auditJson: ({
          scope,
          purgeAfter,
        } satisfies Record<string, unknown>) as unknown as Prisma.InputJsonValue,
      },
    });

    if (args.requestKind === "account") {
      await tx.tenant.update({
        where: { id: args.tenantId },
        data: {
          deletionStatus: "pending_deletion",
          deletionRequestedAt: requestedAt,
          deletionScheduledAt: scheduledFor,
          deletionRestoreUntil: scheduledFor,
          deletedAt: requestedAt,
          deletionCompletedAt: null,
          deletionReason: args.reason || null,
        },
      });

      await tx.user.updateMany({
        where: { tenantId: args.tenantId },
        data: {
          deletionStatus: "pending_deletion",
          deletedAt: requestedAt,
          deletionRequestedAt: requestedAt,
          authRevokedAt: requestedAt,
        },
      });
    }

    return created;
  });

  await writeAuditEntry({
    tenantId: args.tenantId,
    requestId: request.id,
    action: args.requestKind === "account" ? "account.delete.requested" : "data.delete.requested",
    actor: args.requestedByEmail || args.requestedByUserId || null,
    summary: args.requestKind === "account" ? "Account deletion scheduled" : "Partial data deletion completed",
    details: {
      requestKind: args.requestKind,
      retentionDays,
      restoreWindowDays,
    },
  });

  return {
    request,
    trackingToken: requestToken,
    purgeAfter: args.requestKind === "account" ? scheduledFor : null,
    scope,
  };
}

async function deletePartialTenantData(tx: Prisma.TransactionClient, tenantId: string, scope: DeletionScope) {
  if (scope.includeCampaignContacts) {
    await tx.campaignContact.deleteMany({ where: { tenantId } });
  }

  if (scope.includeCalls) {
    await tx.callEvent.deleteMany({ where: { tenantId } });
    await tx.transcriptSegment.deleteMany({ where: { tenantId } });
    await tx.leadExtraction.deleteMany({ where: { tenantId } });
    await tx.campaignCall.deleteMany({ where: { tenantId } });
    await tx.outboundCallRequest.deleteMany({ where: { tenantId } });
    await tx.callSession.deleteMany({ where: { tenantId } });
  }

  if (scope.includeUsageRecords) {
    await tx.usageRecord.deleteMany({ where: { tenantId } });
  }
}

export async function requestPartialDataDeletion(args: DeletionRequestContext) {
  const requestResult = await requestDeletion({
    ...args,
    requestKind: "data",
    retentionDays: args.retentionDays,
    restoreWindowDays: 0,
  });

  const scope = requestResult.scope;
  await prisma.$transaction(async (tx) => {
    await deletePartialTenantData(tx, args.tenantId, scope);
    await tx.accountDeletionRequest.update({
      where: { id: requestResult.request.id },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });
  });

  await writeAuditEntry({
    tenantId: args.tenantId,
    requestId: requestResult.request.id,
    action: "data.delete.completed",
    actor: args.requestedByEmail || args.requestedByUserId || null,
    summary: "Partial data deletion executed",
    details: { scope },
  });

  return {
    request: await loadDeletionRequestById(requestResult.request.id),
    trackingToken: requestResult.trackingToken,
    scope,
  };
}

export async function getDeletionStatus(args: {
  tenantId?: string;
  requestId?: string;
  trackingToken?: string;
}) {
  if (args.requestId) {
    const request = await loadDeletionRequestById(args.requestId);
    if (!request) {
      return null;
    }

    if (args.trackingToken) {
      const tokenMatches = request.publicTrackingTokenHash === sha256(args.trackingToken);
      if (!tokenMatches) {
        return null;
      }
    }

    return request;
  }

  if (!args.tenantId) {
    return null;
  }

  const [tenant, request] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: args.tenantId },
      select: {
        id: true,
        deletionStatus: true,
        deletionRequestedAt: true,
        deletionScheduledAt: true,
        deletionRestoreUntil: true,
        deletedAt: true,
        deletionCompletedAt: true,
        deletionReason: true,
      },
    }),
    getLatestDeletionRequest(args.tenantId),
  ]);

  if (!tenant && !request) {
    return null;
  }

  return { tenant, request };
}

export async function restorePendingDeletion(args: { tenantId: string; actor?: string | null }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: args.tenantId },
    select: {
      id: true,
      deletionStatus: true,
      deletionRestoreUntil: true,
    },
  });

  if (!tenant || tenant.deletionStatus !== "pending_deletion") {
    return null;
  }

  if (tenant.deletionRestoreUntil && tenant.deletionRestoreUntil.getTime() < Date.now()) {
    return null;
  }

  const restored = await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: args.tenantId },
      data: {
        deletionStatus: "active",
        deletionRequestedAt: null,
        deletionScheduledAt: null,
        deletionRestoreUntil: null,
        deletedAt: null,
        deletionCompletedAt: null,
        deletionReason: null,
      },
    });

    await tx.user.updateMany({
      where: { tenantId: args.tenantId },
      data: {
        deletionStatus: "active",
        deletedAt: null,
        deletionRequestedAt: null,
        authRevokedAt: null,
      },
    });

    const request = await tx.accountDeletionRequest.findFirst({
      where: { tenantId: args.tenantId, requestKind: "account" },
      orderBy: { requestedAt: "desc" },
    });

    if (request) {
      await tx.accountDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: "restored",
          cancelledAt: new Date(),
          completedAt: new Date(),
        },
      });
    }

    return request;
  });

  await writeAuditEntry({
    tenantId: args.tenantId,
    requestId: restored?.id || null,
    action: "account.delete.restored",
    actor: args.actor || null,
    summary: "Pending deletion restored during restore window",
  });

  return restored;
}

async function purgeAccountTenant(tenantId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "purged",
        purgeExecutedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await tx.accountDeletionAuditEntry.create({
      data: {
        tenantId,
        requestId,
        action: "account.delete.purged",
        actor: "system",
        summary: "Tenant purge executed",
      },
    });

    await tx.tenant.delete({ where: { id: tenantId } });
  });
}

export async function runDueAccountDeletionPurges() {
  const dueRequests = await prisma.accountDeletionRequest.findMany({
    where: {
      requestKind: "account",
      status: { in: ["scheduled", "pending", "processing"] },
      scheduledFor: { lte: new Date() },
    },
    orderBy: { requestedAt: "asc" },
    take: 20,
  });

  let purged = 0;
  const errors: Array<{ requestId: string; tenantId: string; message: string }> = [];

  for (const request of dueRequests) {
    try {
      await purgeAccountTenant(request.tenantId, request.id);
      purged += 1;
    } catch (error) {
      errors.push({
        requestId: request.id,
        tenantId: request.tenantId,
        message: error instanceof Error ? error.message : String(error),
      });

      await prisma.accountDeletionRequest.update({
        where: { id: request.id },
        data: { status: "failed" },
      });

      await writeAuditEntry({
        tenantId: request.tenantId,
        requestId: request.id,
        action: "account.delete.purge_failed",
        actor: "system",
        summary: "Tenant purge failed",
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return { purged, errors };
}

let deletionSweepTimer: NodeJS.Timeout | null = null;

export function startAccountDeletionSweeper(intervalMs = 10 * 60 * 1000): void {
  if (deletionSweepTimer) {
    return;
  }

  void runDueAccountDeletionPurges().catch((error) => {
    console.warn("[account-deletion] initial purge sweep failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });

  deletionSweepTimer = setInterval(() => {
    void runDueAccountDeletionPurges().catch((error) => {
      console.warn("[account-deletion] scheduled purge sweep failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  deletionSweepTimer.unref?.();
}

export async function listDeletionAuditEntries(tenantId: string) {
  return prisma.accountDeletionAuditEntry.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}