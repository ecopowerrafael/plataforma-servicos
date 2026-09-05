import { describe, expect, it, vi } from 'vitest';

import { IntegrationRepository } from './integration.repository.js';
import { IntegrationService } from './integration.service.js';

import type { CredentialsCipher } from '../payments/gateway/credentials-cipher.js';

const tenantId = 42n;

function buildService(config: {
  active: boolean;
  phoneNumberId: string;
  encryptedAccessToken: string;
  instanceName: string | null;
  connectedPhone: string | null;
  connectionStatus: string;
  lastStatusCheckAt: Date | null;
} | null) {
  const mockClient = {
    tenantWhatsAppConfig: {
      findUnique: vi.fn().mockResolvedValue(config),
      upsert: vi.fn().mockImplementation(({ update }: { update: Record<string, unknown> }) =>
        Promise.resolve({ publicId: 'wa-1', ...config, ...update }),
      ),
    },
    tenantSubscription: {
      // Plano habilita 'whatsapp.enabled' — não é o foco deste teste.
      findFirst: vi.fn().mockResolvedValue({ plan: { limits: [{ booleanValue: true }] } }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const repository = new IntegrationRepository(mockClient as never);
  const cipher: CredentialsCipher = {
    encrypt: vi.fn().mockReturnValue('cipher:new-token'),
    decrypt: vi.fn().mockReturnValue({ token: 'plaintext-should-never-leak' }),
  } as never;
  const service = new IntegrationService(repository, cipher);
  return { service, mockClient, cipher };
}

describe('IntegrationService.whatsappAdminView — platform/support view of a tenant WhatsApp instance', () => {
  it('never includes the token (plaintext or ciphertext) — only a tokenConfigured boolean', async () => {
    const { service } = buildService({
      active: true,
      phoneNumberId: 'inst-123',
      encryptedAccessToken: 'cipher:some-secret-value',
      instanceName: 'agendei-studio-bella',
      connectedPhone: '5511999990000',
      connectionStatus: 'CONNECTED',
      lastStatusCheckAt: new Date('2026-08-01T00:00:00Z'),
    });
    const view = await service.whatsappAdminView(tenantId);
    expect(view).toEqual({
      available: true,
      configured: true,
      active: true,
      instanceId: 'inst-123',
      instanceName: 'agendei-studio-bella',
      phoneNumber: '5511999990000',
      tokenConfigured: true,
      connectionStatus: 'CONNECTED',
      lastCheckedAt: '2026-08-01T00:00:00.000Z',
    });
    // The raw view object must not carry the ciphertext under any key.
    expect(JSON.stringify(view)).not.toContain('cipher:some-secret-value');
  });

  it('reports a clean NOT_CONFIGURED shape when the tenant has no WhatsApp instance at all', async () => {
    const { service } = buildService(null);
    const view = await service.whatsappAdminView(tenantId);
    expect(view).toEqual({
      available: true,
      configured: false,
      active: false,
      instanceId: null,
      instanceName: null,
      phoneNumber: null,
      tokenConfigured: false,
      connectionStatus: 'NOT_CONFIGURED',
      lastCheckedAt: null,
    });
  });
});

describe('IntegrationService.updateWhatsapp — admin manual entry (instanceId/token/phoneNumber/instanceName)', () => {
  it('encrypts a newly-provided token with the same CredentialsCipher and writes instanceName/phoneNumber through', async () => {
    const { service, mockClient, cipher } = buildService(null);
    await service.updateWhatsapp(
      tenantId,
      { active: true, instanceId: 'inst-999', token: 'raw-token', instanceName: 'Loja Centro', phoneNumber: '5511988887777' },
      { userId: 1n, sessionId: null },
    );
    expect(cipher.encrypt).toHaveBeenCalledWith({ token: 'raw-token' });
    expect(mockClient.tenantWhatsAppConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          phoneNumberId: 'inst-999',
          encryptedAccessToken: 'cipher:new-token',
          instanceName: 'Loja Centro',
          connectedPhone: '5511988887777',
        }),
      }),
    );
  });

  it('keeps the existing encrypted token untouched when no new token is sent (never re-encrypts a placeholder)', async () => {
    const { service, mockClient, cipher } = buildService({
      active: false,
      phoneNumberId: 'inst-old',
      encryptedAccessToken: 'cipher:already-stored',
      instanceName: null,
      connectedPhone: null,
      connectionStatus: 'CREATED',
      lastStatusCheckAt: null,
    });
    await service.updateWhatsapp(tenantId, { active: true, instanceId: 'inst-old' }, { userId: 1n, sessionId: null });
    expect(cipher.encrypt).not.toHaveBeenCalled();
    expect(mockClient.tenantWhatsAppConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ encryptedAccessToken: 'cipher:already-stored' }),
      }),
    );
  });
});
