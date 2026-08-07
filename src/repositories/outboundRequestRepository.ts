import { OutboundRequestStatus, Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { assertUuid } from "../lib/uuid";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function createOutboundCallRequest(args: {
  tenantId: string;
  phoneNumber: string;
  roomId: string;
  agentName?: string | null;
  payloadJson?: Prisma.InputJsonValue;
  db?: DbClient;
}) {
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;
  try {
    const result = await db.outboundCallRequest.create({
      data: {
        tenantId: args.tenantId,
        phoneNumber: args.phoneNumber,
        roomId: args.roomId,
        agentName: args.agentName,
        status: "queued",
        payloadJson: args.payloadJson,
      },
    });
    console.log("[CALLS] OutboundCallRequest row created", { id: result.id, tenantId: result.tenantId });
    return result;
  } catch (err) {
    console.log("[CALLS] OutboundCallRequest creation failed", { error: err instanceof Error ? err.message : err });
    throw err;
  }
}

export async function getOutboundCallRequestById(args: {
  requestId: string;
  tenantId: string;
  db?: DbClient;
}) {
  assertUuid(args.requestId, "requestId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  return db.outboundCallRequest.findFirst({
    where: {
      id: args.requestId,
      tenantId: args.tenantId,
    },
  });
}

export async function claimOutboundCallRequestForDispatch(args: {
  requestId: string;
  tenantId: string;
  db?: DbClient;
}) {
  assertUuid(args.requestId, "requestId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  const result = await db.outboundCallRequest.updateMany({
    where: {
      id: args.requestId,
      tenantId: args.tenantId,
      status: "queued",
    },
    data: {
      status: "dispatching",
      errorMessage: null,
    },
  });

  return result.count > 0;
}

export async function markOutboundCallRequestDispatched(args: {
  requestId: string;
  tenantId: string;
  callSessionId: string;
  db?: DbClient;
}) {
  assertUuid(args.requestId, "requestId");
  assertUuid(args.tenantId, "tenantId");
  assertUuid(args.callSessionId, "callSessionId");
  const db = args.db ?? prisma;

  const statusFilter: OutboundRequestStatus[] = ["dispatching", "queued"];

  return db.outboundCallRequest.updateMany({
    where: {
      id: args.requestId,
      tenantId: args.tenantId,
      status: {
        in: statusFilter,
      },
    },
    data: {
      status: "dispatched",
      callSessionId: args.callSessionId,
      errorMessage: null,
    },
  });
}

export async function markOutboundCallRequestFailed(args: {
  requestId: string;
  tenantId: string;
  errorMessage: string;
  db?: DbClient;
}) {
  assertUuid(args.requestId, "requestId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  return db.outboundCallRequest.updateMany({
    where: {
      id: args.requestId,
      tenantId: args.tenantId,
      status: {
        in: ["queued", "dispatching"],
      },
    },
    data: {
      status: "failed",
      errorMessage: args.errorMessage.slice(0, 1000),
    },
  });
}
