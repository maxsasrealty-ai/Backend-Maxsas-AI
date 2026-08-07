import { CallLifecycleStatus, Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, fieldName: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`INVALID_UUID:${fieldName}`);
  }
}

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function createCallSession(args: {
  callId?: string;
  tenantId: string;
  externalCallId?: string | null;
  roomId: string;
  phoneNumber?: string | null;
  agentName?: string | null;
  direction?: string | null;
  state: CallLifecycleStatus;
  db?: DbClient;
}) {
  assertUuid(args.tenantId, "tenantId");
  if (args.callId) {
    assertUuid(args.callId, "callId");
  }
  const db = args.db ?? prisma;

  if (args.callId) {
    return db.callSession.upsert({
      where: { id: args.callId },
      update: {
        tenantId: args.tenantId,
        externalCallId: args.externalCallId ?? null,
        roomId: args.roomId,
        phoneNumber: args.phoneNumber,
        agentName: args.agentName,
        direction: args.direction,
        status: args.state,
      },
      create: {
        id: args.callId,
        tenantId: args.tenantId,
        externalCallId: args.externalCallId ?? null,
        roomId: args.roomId,
        phoneNumber: args.phoneNumber,
        agentName: args.agentName,
        direction: args.direction,
        status: args.state,
      },
    });
  }

  return db.callSession.create({
    data: {
      tenantId: args.tenantId,
      externalCallId: args.externalCallId ?? null,
      roomId: args.roomId,
      phoneNumber: args.phoneNumber,
      agentName: args.agentName,
      direction: args.direction,
      status: args.state,
    },
  });
}

export async function getCallSessionById(callId: string, tenantId: string, db?: DbClient) {
  assertUuid(callId, "callId");
  assertUuid(tenantId, "tenantId");

  const client = db ?? prisma;
  return client.callSession.findFirst({
    where: {
      id: callId,
      tenantId,
    },
  });
}

export async function getCallSessionByExternalId(externalCallId: string, tenantId: string, db?: DbClient) {
  assertUuid(tenantId, "tenantId");

  const client = db ?? prisma;
  return client.callSession.findFirst({
    where: {
      externalCallId,
      tenantId,
    },
  });
}

export async function bindExternalCallId(args: {
  callId: string;
  tenantId: string;
  externalCallId: string;
  db?: DbClient;
}) {
  assertUuid(args.callId, "callId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  await db.callSession.updateMany({
    where: {
      id: args.callId,
      tenantId: args.tenantId,
    },
    data: {
      externalCallId: args.externalCallId,
    },
  });

  return db.callSession.findFirst({
    where: {
      id: args.callId,
      tenantId: args.tenantId,
    },
  });
}

export async function findRecentInFlightCallByPhone(args: {
  tenantId: string;
  phoneNumber: string;
  direction?: string | null;
  withinSeconds: number;
}) {
  assertUuid(args.tenantId, "tenantId");
  const since = new Date(Date.now() - args.withinSeconds * 1000);

  return prisma.callSession.findFirst({
    where: {
      tenantId: args.tenantId,
      phoneNumber: args.phoneNumber,
      ...(args.direction ? { direction: args.direction } : {}),
      status: {
        in: ["queued", "initiated", "dispatching", "ringing", "connected", "active"],
      },
      initiatedAt: {
        gte: since,
      },
    },
    orderBy: {
      initiatedAt: "desc",
    },
  });
}

export async function updateCallSessionState(args: {
  callId: string;
  tenantId: string;
  state: CallLifecycleStatus;
  connectedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  durationSec?: number;       // float from agent — stored as rounded int
  transcriptTurns?: number;
  recordingUrl?: string | null;
  lastError?: string | null;
  callOutcome?: string | null;
  endedBy?: string | null;
  confidence?: number | null;
  db?: DbClient;
}) {
  assertUuid(args.callId, "callId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  await db.callSession.updateMany({
    where: {
      id: args.callId,
      tenantId: args.tenantId,
    },
    data: {
      status: args.state,
      ...(args.connectedAt ? { connectedAt: args.connectedAt } : {}),
      ...(args.completedAt ? { completedAt: args.completedAt } : {}),
      ...(args.failedAt ? { failedAt: args.failedAt } : {}),
      ...(typeof args.durationSec === "number" ? { durationSec: Math.round(args.durationSec) } : {}),
      ...(typeof args.transcriptTurns === "number" ? { transcriptTurns: args.transcriptTurns } : {}),
      ...(typeof args.recordingUrl !== "undefined" ? { recordingUrl: args.recordingUrl } : {}),
      ...(typeof args.lastError !== "undefined" ? { lastError: args.lastError } : {}),
      ...(typeof args.callOutcome !== "undefined" ? { callOutcome: args.callOutcome } : {}),
      ...(typeof args.endedBy !== "undefined" ? { endedBy: args.endedBy } : {}),
      ...(typeof args.confidence !== "undefined" ? { confidence: args.confidence } : {}),
      estimatedCost:
        typeof args.durationSec === "number"
          ? (args.durationSec / 60) * 0.35
          : undefined,
    },
  });

  return db.callSession.findFirst({
    where: {
      id: args.callId,
      tenantId: args.tenantId,
    },
  });
}

export async function listCallSessions(args: {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: CallLifecycleStatus;
  from?: Date;
  to?: Date;
}) {
  assertUuid(args.tenantId, "tenantId");
  const where = {
    tenantId: args.tenantId,
    ...(args.status ? { status: args.status } : {}),
    ...(args.from || args.to
      ? {
          initiatedAt: {
            ...(args.from ? { gte: args.from } : {}),
            ...(args.to ? { lte: args.to } : {}),
          },
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.callSession.findMany({
      where,
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      orderBy: {
        initiatedAt: "desc",
      },
    }),
    prisma.callSession.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getCallDetail(callId: string, tenantId: string) {
  assertUuid(callId, "callId");
  assertUuid(tenantId, "tenantId");

  return prisma.callSession.findFirst({
    where: {
      id: callId,
      tenantId,
    },
    include: {
      events: true,
      leadExtraction: true,
    },
  });
}
