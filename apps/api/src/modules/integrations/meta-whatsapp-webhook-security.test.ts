import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { IntegrationService } from './integration.service.js';

const payloadFor = (phoneNumberId: string) => ({
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: phoneNumberId },
            messages: [{ id: `wamid-${phoneNumberId}`, from: '5511999999999', timestamp: '1788800000', type: 'text', text: { body: 'Oi' } }],
          },
        },
      ],
    },
  ],
});

const sign = (secret: string, rawBody: string) => `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

function subject() {
  const configs = new Map([
    [
      'hook-a',
      {
        id: 1n,
        publicId: 'config-a',
        tenantId: 101n,
        provider: 'META',
        phoneNumberId: 'phone-a',
        active: true,
        encryptedAppSecret: 'enc:{"appSecret":"secret-a"}',
        encryptedVerifyToken: 'enc:{"verifyToken":"verify-a"}',
      },
    ],
    [
      'hook-b',
      {
        id: 2n,
        publicId: 'config-b',
        tenantId: 202n,
        provider: 'META',
        phoneNumberId: 'phone-b',
        active: true,
        encryptedAppSecret: 'enc:{"appSecret":"secret-b"}',
        encryptedVerifyToken: 'enc:{"verifyToken":"verify-b"}',
      },
    ],
    [
      'hook-no-secret',
      {
        id: 3n,
        publicId: 'config-no-secret',
        tenantId: 303n,
        provider: 'META',
        phoneNumberId: 'phone-c',
        active: true,
        encryptedAppSecret: null,
        encryptedVerifyToken: 'enc:{"verifyToken":"verify-c"}',
      },
    ],
  ]);
  const repository = {
    client: {
      tenantSubscription: {
        findFirst: vi.fn().mockResolvedValue({ plan: { limits: [{ booleanValue: true }] } }),
      },
    },
    metaWhatsappByWebhookPublicId: vi.fn((id: string) => Promise.resolve(configs.get(id) ?? null)),
    selectedWhatsappProvider: vi.fn().mockResolvedValue('META'),
    inboundEventByFingerprint: vi.fn().mockResolvedValue(null),
    outboundByExternalMessageId: vi.fn().mockResolvedValue(null),
    updateOutboundStatus: vi.fn(),
    createInboundEvent: vi.fn().mockResolvedValue({ id: 99n }),
    customerByPhone: vi.fn().mockResolvedValue(null),
    tenantName: vi.fn().mockResolvedValue({ displayName: 'Tenant', timezone: 'America/Sao_Paulo', currency: 'BRL' }),
    tenantSlug: vi.fn().mockResolvedValue({ slug: 'tenant' }),
    whatsappAssistantConfig: vi.fn().mockResolvedValue(null),
  };
  const cipher = {
    decrypt: vi.fn((value: string) => JSON.parse(value.replace(/^enc:/u, '')) as Record<string, unknown>),
    encrypt: vi.fn(),
  };
  const service = new IntegrationService(repository as never, cipher as never);
  return { service, repository };
}

describe('Meta WhatsApp tenant-scoped webhook security', () => {
  it('accepts GET verification for tenant A with verify token A', async () => {
    const { service } = subject();

    await expect(service.verifyMetaWebhook('hook-a', { mode: 'subscribe', verifyToken: 'verify-a', challenge: 'ok' })).resolves.toBe('ok');
  });

  it('rejects GET verification for tenant A with verify token B', async () => {
    const { service } = subject();

    await expect(service.verifyMetaWebhook('hook-a', { mode: 'subscribe', verifyToken: 'verify-b', challenge: 'ok' })).resolves.toBeNull();
  });

  it('accepts POST for tenant A signed with tenant A secret', async () => {
    const { service } = subject();
    const payload = payloadFor('phone-a');
    const rawBody = JSON.stringify(payload);

    const result = await service.ingestMetaWebhook('hook-a', rawBody, payload, sign('secret-a', rawBody));

    expect(result).toMatchObject({ statusCode: 200, body: { processed: 1, rejected: 0 } });
  });

  it('rejects POST for tenant A signed with tenant B secret', async () => {
    const { service } = subject();
    const payload = payloadFor('phone-a');
    const rawBody = JSON.stringify(payload);

    const result = await service.ingestMetaWebhook('hook-a', rawBody, payload, sign('secret-b', rawBody));

    expect(result).toMatchObject({ statusCode: 403, body: { code: 'META_WEBHOOK_SIGNATURE_INVALID' } });
  });

  it('rejects tenant A webhook when payload phone_number_id belongs to tenant B', async () => {
    const { service } = subject();
    const payload = payloadFor('phone-b');
    const rawBody = JSON.stringify(payload);

    const result = await service.ingestMetaWebhook('hook-a', rawBody, payload, sign('secret-a', rawBody));

    expect(result).toMatchObject({ statusCode: 403, body: { code: 'META_WEBHOOK_PHONE_NUMBER_MISMATCH' } });
  });

  it('rejects unknown webhookPublicId', async () => {
    const { service } = subject();
    const payload = payloadFor('phone-a');

    await expect(service.ingestMetaWebhook('missing-hook', JSON.stringify(payload), payload, 'sha256=anything')).resolves.toMatchObject({
      statusCode: 404,
      body: { code: 'META_WEBHOOK_NOT_FOUND' },
    });
  });

  it('rejects when tenant app secret is absent', async () => {
    const { service } = subject();
    const payload = payloadFor('phone-c');

    await expect(service.ingestMetaWebhook('hook-no-secret', JSON.stringify(payload), payload, 'sha256=anything')).resolves.toMatchObject({
      statusCode: 403,
      body: { code: 'META_WEBHOOK_APP_SECRET_REQUIRED' },
    });
  });

  it('rejects when signature is absent', async () => {
    const { service } = subject();
    const payload = payloadFor('phone-a');

    await expect(service.ingestMetaWebhook('hook-a', JSON.stringify(payload), payload, undefined)).resolves.toMatchObject({
      statusCode: 403,
      body: { code: 'META_WEBHOOK_SIGNATURE_REQUIRED' },
    });
  });
});
