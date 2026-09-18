import { describe, expect, it } from 'vitest';
import { resolveWhatsAppOwner } from './whatsapp-owner.js';
import { IntegrationRepository } from './integration.repository.js';

describe('resolveWhatsAppOwner', () => {
  it('resolves a tenant without consulting conversation data', () => {
    expect(resolveWhatsAppOwner({ provider: 'WAPI', externalInstanceId: 'I', tenant: { ownerType: 'TENANT', tenantId: '7', integrationId: 'w' } })).toEqual({ ownerType: 'TENANT', tenantId: '7', integrationId: 'w' });
  });
  it('resolves prospecting exclusively', () => {
    expect(resolveWhatsAppOwner({ provider: 'WAPI', externalInstanceId: 'I', prospecting: { ownerType: 'PROSPECTING', integrationId: 'p' } })).toEqual({ ownerType: 'PROSPECTING', integrationId: 'p' });
  });
  it('reports conflict when both domains contain the key', () => {
    expect(resolveWhatsAppOwner({ provider: 'WAPI', externalInstanceId: 'I', tenant: { ownerType: 'TENANT' }, prospecting: { ownerType: 'PROSPECTING' } })).toEqual({ ownerType: 'CONFLICT' });
  });
  it('keeps provider namespace part of the contract', () => {
    expect(resolveWhatsAppOwner({ provider: 'META', externalInstanceId: 'I' })).toEqual({ ownerType: 'NOT_FOUND' });
  });

  it('repository resolution detects both domains without consulting conversations', async () => {
    const tenantWhatsAppConfig = { findMany: async () => [{ tenantId: 7n, publicId: 'tenant-integration' }] };
    const prospectingWhatsAppConfig = { findFirst: async () => ({ publicId: 'prospecting-integration' }) };
    const repository = new IntegrationRepository({ tenantWhatsAppConfig, prospectingWhatsAppConfig } as never);
    await expect(repository.resolveWhatsAppOwner('WAPI', 'INSTANCE')).resolves.toEqual({ ownerType: 'CONFLICT' });
    expect(await repository.resolveWhatsAppOwner('META', 'PHONE')).toEqual({ ownerType: 'TENANT', tenantId: '7', integrationId: 'tenant-integration' });
  });
});
