import {
    CampaignCallRecord,
    CampaignContactRecord,
    CampaignRecord,
    CampaignStatus,
    CreateCampaignInput,
    UpdateCampaignInput,
} from "../../shared/contracts";
import { CampaignStatus as PrismaCampaignStatus } from "../generated/prisma";
import {
    addCampaignContacts,
    attachCallsToCampaign,
    createCampaign,
    deleteCampaign,
    detachCallsFromCampaign,
    getCampaignById,
    listCampaignCalls,
    listCampaignContacts,
    listCampaigns,
    updateCampaign,
} from "../repositories/campaignRepository";
import { getTenantById, upsertTenant } from "../repositories/tenantRepository";
import { getCachedTenantCapabilities } from "./accessService";
import { enforceFeature, getTenantFeatures } from "./planFeatureService";
import { publishCampaignRealtimeEvent } from "./realtimeService";

function toCampaignStatus(status?: CampaignStatus): PrismaCampaignStatus | undefined {
  if (!status) {
    return undefined;
  }

  return status as PrismaCampaignStatus;
}

function mapCampaign(item: {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: PrismaCampaignStatus;
  createdAt: Date;
  updatedAt: Date;
}): CampaignRecord {
  return {
    id: item.id,
    tenantId: item.tenantId,
    name: item.name,
    description: item.description,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapCampaignCall(item: {
  campaignId: string;
  callId: string;
  tenantId: string;
  createdAt: Date;
}): CampaignCallRecord {
  return {
    campaignId: item.campaignId,
    callId: item.callId,
    tenantId: item.tenantId,
    createdAt: item.createdAt.toISOString(),
  };
}

function mapCampaignContact(item: {
  id: string;
  campaignId: string;
  tenantId: string;
  sourceCallId: string | null;
  name: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CampaignContactRecord {
  return {
    id: item.id,
    campaignId: item.campaignId,
    tenantId: item.tenantId,
    sourceCallId: item.sourceCallId,
    name: item.name,
    phone: item.phone,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function ensureCampaignForTenant(campaignId: string, tenantId: string) {
  const campaign = await getCampaignById(campaignId, tenantId);
  if (!campaign) {
    return null;
  }
  return campaign;
}

export async function createTenantCampaign(tenantId: string, input: CreateCampaignInput) {
  await upsertTenant({ tenantId });
  const tenant = await getTenantById(tenantId);
  const features = getTenantFeatures(tenant);

  const created = await createCampaign({
    tenantId,
    name: input.name,
    description: input.description,
    status: toCampaignStatus(input.status),
  });

  let attachedCallIds: string[] = [];
  if (input.callIds && input.callIds.length > 0) {
    enforceFeature("campaign_calls", features);
    const linked = await attachCallsToCampaign({
      campaignId: created.id,
      tenantId,
      callIds: input.callIds,
    });
    attachedCallIds = linked.validCallIds;
  }

  let contactCount = 0;
  if (input.contacts && input.contacts.length > 0) {
    const contacts = await addCampaignContacts({
      campaignId: created.id,
      tenantId,
      contacts: input.contacts,
    });
    contactCount = contacts.length;
  }

  publishCampaignRealtimeEvent({
    tenantId,
    campaignId: created.id,
    eventType: "campaign_created",
    payload: {
      status: created.status,
      attachedCallIds,
      contactCount,
    },
  });

  return mapCampaign(created);
}

export async function listTenantCampaigns(args: {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: CampaignStatus;
}) {
  const result = await listCampaigns({
    tenantId: args.tenantId,
    page: args.page,
    pageSize: args.pageSize,
    status: toCampaignStatus(args.status),
  });

  return {
    items: result.items.map(mapCampaign),
    totalItems: result.totalItems,
  };
}

export async function getTenantCampaign(campaignId: string, tenantId: string) {
  const campaign = await ensureCampaignForTenant(campaignId, tenantId);
  if (!campaign) {
    return null;
  }

  return mapCampaign(campaign);
}

export async function updateTenantCampaign(campaignId: string, tenantId: string, input: UpdateCampaignInput) {
  const existing = await ensureCampaignForTenant(campaignId, tenantId);
  if (!existing) {
    return null;
  }
  const tenant = await getTenantById(tenantId);
  const features = getTenantFeatures(tenant);

  const updated = await updateCampaign({
    campaignId,
    name: input.name,
    description: input.description,
    status: toCampaignStatus(input.status),
  });

  let addedCount = 0;
  if (input.addCallIds && input.addCallIds.length > 0) {
    enforceFeature("campaign_calls", features);
    const attached = await attachCallsToCampaign({
      campaignId,
      tenantId,
      callIds: input.addCallIds,
    });
    addedCount = attached.count;
  }

  let removedCount = 0;
  if (input.removeCallIds && input.removeCallIds.length > 0) {
    removedCount = await detachCallsFromCampaign({
      campaignId,
      tenantId,
      callIds: input.removeCallIds,
    });
  }

  publishCampaignRealtimeEvent({
    tenantId,
    campaignId,
    eventType: "campaign_updated",
    payload: {
      status: updated.status,
      addedCount,
      removedCount,
    },
  });

  if (addedCount > 0) {
    publishCampaignRealtimeEvent({
      tenantId,
      campaignId,
      eventType: "campaign_calls_added",
      payload: {
        addedCount,
      },
    });
  }

  if (removedCount > 0) {
    publishCampaignRealtimeEvent({
      tenantId,
      campaignId,
      eventType: "campaign_calls_removed",
      payload: {
        removedCount,
      },
    });
  }

  return mapCampaign(updated);
}

export async function deleteTenantCampaign(campaignId: string, tenantId: string): Promise<boolean> {
  const existing = await ensureCampaignForTenant(campaignId, tenantId);
  if (!existing) {
    return false;
  }

  await deleteCampaign(campaignId, tenantId);

  publishCampaignRealtimeEvent({
    tenantId,
    campaignId,
    eventType: "campaign_deleted",
    payload: {
      deleted: true,
    },
  });

  return true;
}

export async function getCampaignCallsForTenant(campaignId: string, tenantId: string) {
  const campaign = await ensureCampaignForTenant(campaignId, tenantId);
  if (!campaign) {
    return null;
  }

  const items = await listCampaignCalls(campaignId, tenantId);
  return items.map((item) => mapCampaignCall(item));
}

export async function getCampaignContactsForTenant(campaignId: string, tenantId: string) {
  const campaign = await ensureCampaignForTenant(campaignId, tenantId);
  if (!campaign) {
    return null;
  }

  const items = await listCampaignContacts(campaignId, tenantId);
  return items.map((item) => mapCampaignContact(item));
}

export async function getCampaignWorkspaceMeta(tenantId: string) {
  const access = await getCachedTenantCapabilities(tenantId);
  return {
    workspaceType: access.workspaceConfig.workspaceType,
    planName: access.workspaceConfig.planName,
    vocabulary: access.workspaceConfig.vocabulary,
  };
}
