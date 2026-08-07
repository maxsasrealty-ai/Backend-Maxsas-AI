import { Prisma, Speaker } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { assertUuid } from "../lib/uuid";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function upsertTranscriptSegment(args: {
  callId: string;
  tenantId: string;
  speaker: Speaker;
  text: string;
  isFinal: boolean;
  sequenceNo: number;
  providerMessageId?: string | null;
  rawJson?: Prisma.InputJsonValue;
  occurredAt: Date;
  db?: DbClient;
}) {
  assertUuid(args.callId, "callId");
  assertUuid(args.tenantId, "tenantId");
  const db = args.db ?? prisma;

  const existing = await db.transcriptSegment.findFirst({
    where: {
      callId: args.callId,
      tenantId: args.tenantId,
      sequenceNo: args.sequenceNo,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    await db.transcriptSegment.updateMany({
      where: {
        id: existing.id,
        tenantId: args.tenantId,
      },
      data: {
        text: args.text,
        isFinal: args.isFinal,
        providerMessageId: args.providerMessageId,
        rawJson: args.rawJson,
        occurredAt: args.occurredAt,
      },
    });

    return db.transcriptSegment.findFirst({
      where: {
        id: existing.id,
        tenantId: args.tenantId,
      },
    });
  }

  return db.transcriptSegment.create({
    data: {
      callId: args.callId,
      tenantId: args.tenantId,
      speaker: args.speaker,
      text: args.text,
      isFinal: args.isFinal,
      sequenceNo: args.sequenceNo,
      providerMessageId: args.providerMessageId,
      rawJson: args.rawJson,
      occurredAt: args.occurredAt,
    },
  });
}

export async function listTranscriptSegments(args: {
  callId: string;
  tenantId: string;
  page: number;
  pageSize: number;
}) {
  assertUuid(args.callId, "callId");
  assertUuid(args.tenantId, "tenantId");
  const where = {
    callId: args.callId,
    tenantId: args.tenantId,
  };

  const [items, totalItems] = await Promise.all([
    prisma.transcriptSegment.findMany({
      where,
      orderBy: [{ sequenceNo: "asc" }, { createdAt: "asc" }],
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    prisma.transcriptSegment.count({ where }),
  ]);

  return { items, totalItems };
}
