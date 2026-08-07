import { Prisma, VoiceEventType } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { assertUuid } from "../lib/uuid";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function findEventByDedupKey(args: {
  tenantId: string;
  eventId: string;
  db?: DbClient;
}) {
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  return db.callEvent.findFirst({
    where: {
      tenantId: args.tenantId,
      eventId: args.eventId,
    },
  });
}

export async function createCallEvent(args: {
  callId: string;
  tenantId: string;
  eventType: VoiceEventType;
  occurredAt: Date;
  eventId: string;
  payloadJson: Prisma.InputJsonValue;
  rawEnvelope: Prisma.InputJsonValue;
  rawHeaders: Prisma.InputJsonValue;
  db?: DbClient;
}) {
  assertUuid(args.callId, "callId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  return db.callEvent.create({
    data: {
      callId: args.callId,
      tenantId: args.tenantId,
      eventType: args.eventType,
      occurredAt: args.occurredAt,
      eventId: args.eventId,
      payloadJson: args.payloadJson,
      rawEnvelope: args.rawEnvelope,
      rawHeaders: args.rawHeaders,
    },
  });
}
