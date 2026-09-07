import { describe, expect, it, vi } from 'vitest';

import { WhatsAppConnectionService } from './whatsapp-connection.service.js';

const capabilities = {
  qrCode: true,
  autoProvision: true,
  interactiveMessages: true,
  templates: false,
  official: false,
};

function subject(providerOverrides: Record<string, unknown> = {}) {
  const provider = {
    provider: 'WAPI',
    capabilities,
    current: vi.fn().mockResolvedValue({ state: 'CONNECTED' }),
    connect: vi.fn().mockResolvedValue({ state: 'CREATED' }),
    qrCode: vi.fn().mockResolvedValue({ qrCode: 'data:image/png;base64,AAA', view: { state: 'WAITING_QR' } }),
    refreshStatus: vi.fn().mockResolvedValue({ state: 'CONNECTED' }),
    disconnect: vi.fn().mockResolvedValue({ state: 'DISCONNECTED' }),
    reconnect: vi.fn().mockResolvedValue({ qrCode: 'data:image/png;base64,BBB', view: { state: 'WAITING_QR' } }),
    ...providerOverrides,
  };
  const resolver = {
    capabilities: vi.fn((providerId: string) =>
      providerId === 'META'
        ? { qrCode: false, autoProvision: false, interactiveMessages: true, templates: true, official: true }
        : capabilities,
    ),
    provisioningForTenant: vi.fn().mockResolvedValue(provider),
  };
  const tenantWhatsAppConfig = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockImplementation(({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
      Promise.resolve({ ...create, ...update, connectedPhone: null, connectedName: null, connectedAt: null, lastStatusCheckAt: null }),
    ),
    update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...data, connectedPhone: null, connectedName: null, connectedAt: null, lastStatusCheckAt: new Date('2026-09-07T12:00:00.000Z') }),
    ),
  };
  const cipher = { encrypt: vi.fn((value: unknown) => `enc:${JSON.stringify(value)}`) };
  return {
    provider,
    resolver,
    tenantWhatsAppConfig,
    cipher,
    service: new WhatsAppConnectionService(
      resolver as never,
      { tenantWhatsAppConfig } as never,
      cipher as never,
    ),
  };
}

describe('WhatsAppConnectionService', () => {
  it('returns provider options with capabilities without making META operational yet', () => {
    const { service } = subject();
    expect(service.providers()).toEqual({
      items: [
        expect.objectContaining({ provider: 'WAPI', available: true, capabilities }),
        expect.objectContaining({
          provider: 'META',
          available: true,
          capabilities: expect.objectContaining({ qrCode: false, templates: true, official: true }),
        }),
      ],
    });
  });

  it('delegates connection operations to the tenant provider selected by the resolver', async () => {
    const { provider, resolver, service } = subject();
    await expect(service.current(7n)).resolves.toMatchObject({ state: 'CONNECTED' });
    await expect(service.connect(7n)).resolves.toMatchObject({ state: 'CREATED' });
    await expect(service.refreshStatus(7n)).resolves.toMatchObject({ state: 'CONNECTED' });
    await expect(service.disconnect(7n)).resolves.toMatchObject({ state: 'DISCONNECTED' });
    expect(resolver.provisioningForTenant).toHaveBeenCalledWith(7n);
    expect(provider.connect).toHaveBeenCalledWith(7n);
  });

  it('uses QR operations only when the selected provider exposes the capability', async () => {
    const { provider, service } = subject();
    await expect(service.qrCode(7n)).resolves.toMatchObject({ qrCode: 'data:image/png;base64,AAA' });
    await expect(service.reconnect(7n)).resolves.toMatchObject({ qrCode: 'data:image/png;base64,BBB' });
    expect(provider.qrCode).toHaveBeenCalledWith(7n);
    expect(provider.reconnect).toHaveBeenCalledWith(7n);
  });

  it('rejects QR operations for providers without QR capability', async () => {
    const { service } = subject({ capabilities: { ...capabilities, qrCode: false }, qrCode: undefined, reconnect: undefined });
    await expect(service.qrCode(7n)).rejects.toMatchObject({
      code: 'WHATSAPP_PROVIDER_CAPABILITY_UNAVAILABLE',
    });
    await expect(service.reconnect(7n)).rejects.toMatchObject({
      code: 'WHATSAPP_PROVIDER_CAPABILITY_UNAVAILABLE',
    });
  });

  it('keeps WAPI selected without creating placeholder credentials', async () => {
    const { service, tenantWhatsAppConfig } = subject();
    await expect(service.selectProvider(7n, { provider: 'WAPI' })).resolves.toMatchObject({
      provider: 'WAPI',
      capabilities: { qrCode: true, official: false },
    });
    expect(tenantWhatsAppConfig.upsert).not.toHaveBeenCalled();
  });

  it('stores Meta credentials encrypted and exposes Meta capabilities', async () => {
    const { service, tenantWhatsAppConfig, cipher } = subject();
    await expect(
      service.selectProvider(7n, {
        provider: 'META',
        phoneNumberId: '1234567890',
        businessAccountId: '9876543210',
        accessToken: 'token-meta-com-tamanho-suficiente',
        apiVersion: 'v23.0',
      }),
    ).resolves.toMatchObject({
      provider: 'META',
      capabilities: { qrCode: false, templates: true, official: true },
      connection: { provisioned: true, state: 'CREATED' },
    });
    expect(cipher.encrypt).toHaveBeenCalledWith({ accessToken: 'token-meta-com-tamanho-suficiente' });
    expect(tenantWhatsAppConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: 'META',
          phoneNumberId: '1234567890',
          businessAccountId: '9876543210',
          encryptedAccessToken: expect.stringContaining('enc:'),
        }),
      }),
    );
  });

  it('blocks provider switch while another provider is actively connected', async () => {
    const { service, tenantWhatsAppConfig } = subject();
    tenantWhatsAppConfig.findUnique.mockResolvedValue({
      provider: 'WAPI',
      active: true,
      connectionStatus: 'CONNECTED',
    });
    await expect(
      service.selectProvider(7n, {
        provider: 'META',
        phoneNumberId: '1234567890',
        businessAccountId: '9876543210',
        accessToken: 'token-meta-com-tamanho-suficiente',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_SWITCH_REQUIRES_DISCONNECT' });
    expect(tenantWhatsAppConfig.upsert).not.toHaveBeenCalled();
  });

  it('switches from a disconnected Meta config back to WAPI before the next connection action', async () => {
    const { service, tenantWhatsAppConfig, resolver } = subject();
    tenantWhatsAppConfig.findUnique.mockResolvedValue({
      provider: 'META',
      active: false,
      connectionStatus: 'DISCONNECTED',
    });

    await expect(service.selectProvider(7n, { provider: 'WAPI' })).resolves.toMatchObject({
      provider: 'WAPI',
      capabilities: { qrCode: true, official: false },
      connection: { provider: 'WAPI', provisioned: false, state: 'NOT_CREATED' },
    });

    expect(tenantWhatsAppConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 7n },
        data: expect.objectContaining({
          active: false,
          provider: 'WAPI',
          businessAccountId: 'internal',
          apiVersion: 'v1',
          connectionStatus: 'NOT_CREATED',
        }),
      }),
    );
    expect(resolver.provisioningForTenant).not.toHaveBeenCalled();
  });
});
