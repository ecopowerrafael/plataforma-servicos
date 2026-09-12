import { describe, expect, it, vi } from 'vitest';

import { IntegrationService } from './integration.service.js';
import { WhatsAppProviderNotSupportedError, WhatsAppProviderResolver } from './whatsapp-provider-resolver.js';
import { normalizeWApiWebhook } from './whatsapp-inbound.js';

const delivery = {
  provider: 'WAPI',
  capabilities: {
    qrCode: true,
    autoProvision: true,
    interactiveMessages: true,
    templates: false,
    official: false,
  },
} as never;

const provisioning = delivery;

function resolver(provider: string | null) {
  const client = {
    tenantWhatsAppSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    tenantWhatsAppConfig: {
      findFirst: vi.fn().mockResolvedValue(provider === null ? null : { provider }),
    },
  };
  return {
    client,
    resolver: new WhatsAppProviderResolver(client as never, { delivery, provisioning }),
  };
}

describe('WhatsAppProviderResolver', () => {
  it('uses WAPI as the initial default when the tenant has no WhatsApp config yet', async () => {
    const { resolver: subject } = resolver(null);
    await expect(subject.providerForTenant(1n)).resolves.toBe('WAPI');
    await expect(subject.deliveryForTenant(1n)).resolves.toBe(delivery);
    await expect(subject.provisioningForTenant(1n)).resolves.toBe(provisioning);
  });

  it('selects the WAPI adapter from TenantWhatsAppConfig.provider', async () => {
    const { resolver: subject } = resolver('WAPI');
    await expect(subject.providerForTenant(1n)).resolves.toBe('WAPI');
    expect(subject.inbound('WAPI').provider).toBe('WAPI');
    expect(subject.capabilities('WAPI')).toMatchObject({ qrCode: true, official: false });
  });

  it('describes META capabilities and rejects operational access until a Meta adapter is registered', async () => {
    const { resolver: subject } = resolver('META');
    await expect(subject.providerForTenant(1n)).resolves.toBe('META');
    expect(subject.capabilities('META')).toMatchObject({
      qrCode: false,
      templates: false,
      official: true,
    });
    await expect(subject.deliveryForTenant(1n)).rejects.toBeInstanceOf(WhatsAppProviderNotSupportedError);
    await expect(subject.provisioningForTenant(1n)).rejects.toMatchObject({
      code: 'WHATSAPP_PROVIDER_NOT_SUPPORTED',
    });
  });

  it('resolves META delivery and provisioning when Meta adapters are registered', async () => {
    const client = {
      tenantWhatsAppSettings: {
        findUnique: vi.fn().mockResolvedValue({ selectedProvider: 'META' }),
      },
      tenantWhatsAppConfig: {
        findFirst: vi.fn().mockResolvedValue({ provider: 'META' }),
      },
    };
    const meta = { delivery: { provider: 'META' }, provisioning: { provider: 'META' } };
    const subject = new WhatsAppProviderResolver(client as never, { delivery, provisioning }, meta as never);
    await expect(subject.deliveryForTenant(1n)).resolves.toBe(meta.delivery);
    await expect(subject.provisioningForTenant(1n)).resolves.toBe(meta.provisioning);
    expect(subject.inbound('META').provider).toBe('META');
  });

  it('accepts an additional provider without changing integration consumers', async () => {
    const client = {
      tenantWhatsAppSettings: {
        findUnique: vi.fn().mockResolvedValue({ selectedProvider: 'EVOLUTION' }),
      },
      tenantWhatsAppConfig: {
        findFirst: vi.fn().mockResolvedValue({ provider: 'EVOLUTION' }),
      },
    };
    const extraCapabilities = {
      qrCode: true,
      autoProvision: true,
      interactiveMessages: true,
      templates: false,
      official: false,
    };
    const evolution = {
      delivery: { provider: 'EVOLUTION' },
      provisioning: { provider: 'EVOLUTION' },
      inbound: {
        provider: 'EVOLUTION',
        capabilities: extraCapabilities,
        normalize: vi.fn(),
      },
      capabilities: extraCapabilities,
    };
    const subject = new WhatsAppProviderResolver(
      client as never,
      { delivery, provisioning },
      undefined,
      { EVOLUTION: evolution as never },
    );

    await expect(subject.providerForTenant(1n)).resolves.toBe('EVOLUTION');
    await expect(subject.deliveryForTenant(1n)).resolves.toBe(evolution.delivery);
    await expect(subject.provisioningForTenant(1n)).resolves.toBe(evolution.provisioning);
    expect(subject.inbound('EVOLUTION')).toBe(evolution.inbound);
    expect(subject.capabilities('EVOLUTION')).toBe(extraCapabilities);
  });

  it('rejects unknown providers with WHATSAPP_PROVIDER_NOT_SUPPORTED', async () => {
    const { resolver: subject } = resolver('OTHER');
    await expect(subject.deliveryForTenant(1n)).rejects.toMatchObject({
      code: 'WHATSAPP_PROVIDER_NOT_SUPPORTED',
    });
    expect(() => subject.inbound('OTHER')).toThrow(WhatsAppProviderNotSupportedError);
  });

  it('lets IntegrationService normalize tenant inbound events through the resolver provider', async () => {
    const normalize = vi.fn((raw: unknown) => normalizeWApiWebhook(raw));
    const providerResolver = {
      inbound: vi.fn(() => ({ provider: 'WAPI', capabilities: delivery.capabilities, normalize })),
    };
    const repository = {
      client: {},
      whatsappByInstanceId: vi.fn().mockResolvedValue({ tenantId: 7n, phoneNumberId: 'INST', provider: 'WAPI' }),
      inboundEventByFingerprint: vi.fn().mockResolvedValue({ id: 1n }),
    };
    const service = new IntegrationService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      providerResolver as never,
    );

    const result = await service.ingestWhatsappInbound({
      event: 'webhookReceived',
      instanceId: 'INST',
      messageId: 'M1',
      sender: { id: '5511999999999' },
      msgContent: { conversation: 'oi' },
    });

    expect(result).toEqual({ accepted: true, duplicated: true });
    expect(providerResolver.inbound).toHaveBeenCalledWith('WAPI');
    expect(normalize).toHaveBeenCalledOnce();
  });

  it('does not fallback to WAPI when a tenant config points to an unsupported provider', async () => {
    const providerResolver = new WhatsAppProviderResolver({ tenantWhatsAppSettings: { findUnique: vi.fn().mockResolvedValue(null) }, tenantWhatsAppConfig: { findFirst: vi.fn().mockResolvedValue({ provider: 'OTHER' }) } } as never, {
      delivery,
      provisioning,
    });
    const repository = {
      client: {},
      whatsappByInstanceId: vi.fn().mockResolvedValue({ tenantId: 7n, phoneNumberId: 'INST', provider: 'OTHER' }),
    };
    const service = new IntegrationService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      providerResolver,
    );

    await expect(
      service.ingestWhatsappInbound({ event: 'webhookReceived', instanceId: 'INST' }),
    ).rejects.toMatchObject({ code: 'WHATSAPP_PROVIDER_NOT_SUPPORTED' });
  });
});
