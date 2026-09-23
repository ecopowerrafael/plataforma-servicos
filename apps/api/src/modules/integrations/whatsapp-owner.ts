import type { WhatsAppProviderId } from './whatsapp-provider.js';

export type WhatsAppOwnerType = 'TENANT' | 'PROSPECTING' | 'NOT_FOUND' | 'CONFLICT';

export interface WhatsAppOwnerCandidate {
  ownerType: 'TENANT' | 'PROSPECTING';
  tenantId?: string;
  integrationId?: string;
}

export interface WhatsAppOwnerResolution {
  ownerType: WhatsAppOwnerType;
  tenantId?: string;
  integrationId?: string;
}

/**
 * Resolves ownership from the provider namespace and external instance key.
 * Conversation, lead and contact data deliberately do not participate.
 */
export function resolveWhatsAppOwner(input: {
  provider: WhatsAppProviderId;
  externalInstanceId: string;
  tenant?: WhatsAppOwnerCandidate | null;
  prospecting?: WhatsAppOwnerCandidate | null;
}): WhatsAppOwnerResolution {
  if (input.tenant?.ownerType === 'TENANT' && input.tenant.tenantId === undefined && input.tenant.integrationId === undefined) return { ownerType: 'CONFLICT' };
  const tenant = input.tenant ?? null;
  const prospecting = input.prospecting ?? null;
  if (tenant !== null && prospecting !== null) return { ownerType: 'CONFLICT' };
  if (tenant !== null) return { ...tenant, ownerType: 'TENANT' };
  if (prospecting !== null) return { ...prospecting, ownerType: 'PROSPECTING' };
  return { ownerType: 'NOT_FOUND' };
}
