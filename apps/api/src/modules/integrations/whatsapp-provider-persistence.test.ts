import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { WhatsAppConnectionService } from './whatsapp-connection.service.js';
import { WhatsAppProvisioningService } from './whatsapp-provisioning.service.js';

const wapiConfig = {
  id: 1n,
  publicId: 'wapi-public',
  tenantId: 7n,
  provider: 'WAPI',
  active: false,
  phoneNumberId: 'WAPI-ABC',
  instanceName: 'agendei-legado',
  encryptedAccessToken: 'TOKEN-WAPI',
  businessAccountId: 'internal',
  apiVersion: 'v1',
  connectionStatus: 'DISCONNECTED',
  connectedPhone: null,
  connectedName: null,
  connectedAt: null,
  lastStatusCheckAt: null,
  lastValidationStatus: null,
  lastValidatedAt: null,
  assistantConfig: { menu: { custom: true } },
  createdAt: new Date('2026-09-07T00:00:00.000Z'),
  updatedAt: new Date('2026-09-07T00:00:00.000Z'),
};

const metaConfig = {
  ...wapiConfig,
  id: 2n,
  publicId: 'meta-public',
  provider: 'META',
  phoneNumberId: 'META-PHONE',
  encryptedAccessToken: 'TOKEN-META',
  businessAccountId: 'WABA',
  apiVersion: 'v23.0',
  connectionStatus: 'CREATED',
};

describe('WhatsApp provider persistence hardening', () => {
  it('migration expands settings and keeps legacy config values byte-for-byte', () => {
    const sql = readFileSync(
      new URL('../../../prisma/migrations/20261007000000_whatsapp_provider_settings/migration.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE `tenant_whatsapp_settings`');
    expect(sql).toContain('`selected_provider`');
    expect(sql).toContain('`assistant_config` JSON NULL');
    expect(sql).toContain('SELECT');
    expect(sql).toContain('COALESCE(NULLIF(`provider`, \'\'), \'WAPI\')');
    expect(sql).toContain('`assistant_config`');
    expect(sql).toContain('DROP INDEX `tenant_whatsapp_configs_tenant_id_key`');
    expect(sql).toContain('ADD UNIQUE INDEX `tenant_whatsapp_configs_tenant_provider_key` (`tenant_id`, `provider`)');
    expect(sql).not.toContain('DROP COLUMN `assistant_config`');
    expect(sql).not.toContain('UPDATE `tenant_whatsapp_configs` SET `phone_number_id`');
    expect(sql).not.toContain('encrypted_access_token` =');
  });

  it('WAPI -> META -> WAPI reuses the same WAPI config and never recreates the instance', async () => {
    const tenantWhatsAppSettings = {
      findUnique: vi.fn()
        .mockResolvedValueOnce({ selectedProvider: 'WAPI' })
        .mockResolvedValueOnce({ selectedProvider: 'META' }),
      upsert: vi.fn().mockImplementation(({ update }) => Promise.resolve(update)),
    };
    const tenantWhatsAppConfig = {
      findFirst: vi.fn().mockResolvedValue(wapiConfig),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const provider = where.tenantId_provider.provider;
        return Promise.resolve(provider === 'WAPI' ? wapiConfig : metaConfig);
      }),
      upsert: vi.fn().mockResolvedValue(metaConfig),
    };
    const resolver = {
      capabilities: vi.fn((provider: string) => provider === 'META'
        ? { qrCode: false, autoProvision: false, interactiveMessages: true, templates: false, official: true }
        : { qrCode: true, autoProvision: true, interactiveMessages: true, templates: false, official: false }),
      provisioningForTenant: vi.fn().mockResolvedValue({ current: vi.fn().mockResolvedValue({ provider: 'WAPI', state: 'DISCONNECTED' }) }),
    };
    const cipher = { encrypt: vi.fn((value) => `enc:${JSON.stringify(value)}`) };
    process.env.META_WHATSAPP_VERIFY_TOKEN = 'verify-token';
    process.env.META_WHATSAPP_APP_SECRET = 'app-secret';
    const service = new WhatsAppConnectionService(
      resolver as never,
      { tenantWhatsAppSettings, tenantWhatsAppConfig } as never,
      cipher as never,
    );

    await service.selectProvider(7n, {
      provider: 'META',
      phoneNumberId: 'META-PHONE',
      businessAccountId: 'WABA',
      accessToken: 'meta-token-com-tamanho-suficiente',
    });
    await service.selectProvider(7n, { provider: 'WAPI' });

    expect(tenantWhatsAppConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_provider: { tenantId: 7n, provider: 'META' } },
    }));
    expect(tenantWhatsAppSettings.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 7n },
      update: { selectedProvider: 'WAPI' },
    }));
    expect(tenantWhatsAppConfig.findUnique).toHaveBeenCalledWith({
      where: { tenantId_provider: { tenantId: 7n, provider: 'WAPI' } },
    });
    delete process.env.META_WHATSAPP_VERIFY_TOKEN;
    delete process.env.META_WHATSAPP_APP_SECRET;
  });

  it('first WAPI creates once and second connect reuses the created config', async () => {
    const created = { ...wapiConfig, connectionStatus: 'CREATED' };
    const tenantWhatsAppConfig = {
      findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(created),
      create: vi.fn().mockResolvedValue(created),
    };
    const provider = { createInstance: vi.fn().mockResolvedValue({ instanceId: 'WAPI-ABC', instanceName: 'agendei-7', token: 'TOKEN-WAPI' }) };
    const client = {
      tenantWhatsAppConfig,
      tenant: { findUnique: vi.fn().mockResolvedValue({ slug: 'tenant-7' }) },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ plan: { limits: [{ key: 'whatsapp.enabled', booleanValue: true }] } }) },
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    };
    const cipher = { encrypt: vi.fn(() => 'TOKEN-WAPI'), decrypt: vi.fn(() => ({ token: 'TOKEN-WAPI' })) };
    const service = new WhatsAppProvisioningService(client as never, provider as never, cipher as never);

    await service.connect(7n);
    await service.connect(7n);

    expect(provider.createInstance).toHaveBeenCalledTimes(1);
    expect(tenantWhatsAppConfig.create).toHaveBeenCalledTimes(1);
    expect(tenantWhatsAppConfig.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ provider: 'WAPI', phoneNumberId: 'WAPI-ABC' }),
    }));
  });
});
