import { CampaignStatus } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function createCampaign(args: {
  tenantId: string;
  name: string;
  description?: string;
  status?: CampaignStatus;
}) {
  return prisma.campaign.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      description: args.description,
      status: args.status,
    },
  });
}

export async function listCampaigns(args: {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: CampaignStatus;
}) {
  const where = {
    tenantId: args.tenantId,
    ...(args.status ? { status: args.status } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.campaign.findMany({
      where,
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getCampaignById(campaignId: string, tenantId: string) {
  return prisma.campaign.findFirst({
    where: {
      id: campaignId,
      tenantId,
    },
  });
}

export async function updateCampaign(args: {
  campaignId: string;
  name?: string;
  description?: string | null;
  status?: CampaignStatus;
}) {
  return prisma.campaign.update({
    where: { id: args.campaignId },
    data: {
      ...(typeof args.name !== "undefined" ? { name: args.name } : {}),
      ...(typeof args.description !== "undefined" ? { description: args.description } : {}),
      ...(typeof args.status !== "undefined" ? { status: args.status } : {}),
    },
  });
}

export async function deleteCampaign(campaignId: string, tenantId: string) {
  return prisma.campaign.deleteMany({
    where: {
      id: campaignId,
      tenantId,
    },
  });
}

export async function attachCallsToCampaign(args: {
  campaignId: string;
  tenantId: string;
  callIds: string[];
}) {
  const validCalls = await prisma.callSession.findMany({
    where: {
      id: { in: args.callIds },
      tenantId: args.tenantId,
    },
    select: { id: true },
  });

  const validCallIds = validCalls.map((item) => item.id);

  if (validCallIds.length === 0) {
    return { count: 0, validCallIds: [] as string[] };
  }

  const existingLinks = await prisma.campaignCall.findMany({
    where: {
      campaignId: args.campaignId,
      tenantId: args.tenantId,
      callId: {
        in: validCallIds,
      },
    },
    select: {
      callId: true,
    },
  });

  const existingCallIdSet = new Set(existingLinks.map((item) => item.callId));
  const toCreate = validCallIds.filter((callId) => !existingCallIdSet.has(callId));

  if (toCreate.length === 0) {
    return { count: 0, validCallIds };
  }

  const result = await prisma.campaignCall.createMany({
    data: toCreate.map((callId) => ({
      campaignId: args.campaignId,
      callId,
      tenantId: args.tenantId,
    })),
  });

  return { count: result.count, validCallIds };
}

export async function detachCallsFromCampaign(args: {
  campaignId: string;
  tenantId: string;
  callIds: string[];
}) {
  const result = await prisma.campaignCall.deleteMany({
    where: {
      campaignId: args.campaignId,
      tenantId: args.tenantId,
      callId: {
        in: args.callIds,
      },
    },
  });

  return result.count;
}

export async function addCampaignContacts(args: {
  campaignId: string;
  tenantId: string;
  contacts: {
    sourceCallId?: string;
    name?: string;
    phone?: string;
    notes?: string;
  }[];
}) {
  const referencedCallIds = Array.from(
    new Set(args.contacts.map((contact) => contact.sourceCallId).filter((value): value is string => Boolean(value)))
  );

  const validSourceCallSet = new Set<string>();
  if (referencedCallIds.length > 0) {
    const validCalls = await prisma.callSession.findMany({
      where: {
        tenantId: args.tenantId,
        id: {
          in: referencedCallIds,
        },
      },
      select: {
        id: true,
      },
    });

    validCalls.forEach((call) => validSourceCallSet.add(call.id));
  }

  const result = await prisma.$transaction(
    args.contacts.map((contact) =>
      prisma.campaignContact.create({
        data: {
          campaignId: args.campaignId,
          tenantId: args.tenantId,
          sourceCallId: contact.sourceCallId && validSourceCallSet.has(contact.sourceCallId)
            ? contact.sourceCallId
            : undefined,
          name: contact.name,
          phone: contact.phone,
          notes: contact.notes,
        },
      })
    )
  );

  return result;
}

export async function listCampaignCalls(campaignId: string, tenantId: string) {
  return prisma.campaignCall.findMany({
    where: {
      campaignId,
      tenantId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      call: true,
    },
  });
}

export async function listCampaignContacts(campaignId: string, tenantId: string) {
  return prisma.campaignContact.findMany({
    where: {
      campaignId,
      tenantId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
