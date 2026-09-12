import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  canonicalMetaWhatsAppWebhookPath,
  canonicalWapiWhatsAppWebhookPath,
  metaWhatsAppWebhookPath,
  whatsappWebhookPath,
  whatsappWebhookRoutes,
} from './whatsapp-webhook.routes.js';

const canonicalMeta = (id: string) => canonicalMetaWhatsAppWebhookPath.replace(':webhookPublicId', id);
const legacyMeta = (id: string) => metaWhatsAppWebhookPath.replace(':webhookPublicId', id);

const build = async () => {
  process.env.WAPI_WEBHOOK_SECRET = 'test-wapi-webhook-secret-32-characters';
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  const service = {
    ingestWhatsappInbound: vi.fn().mockResolvedValue({ accepted: true, provider: 'WAPI' }),
    verifyMetaWebhook: vi.fn().mockResolvedValue('abc123'),
    ingestMetaWebhook: vi.fn().mockResolvedValue({ statusCode: 200, body: { received: true, processed: 1, duplicated: 0, rejected: 0 } }),
  };
  await app.register(whatsappWebhookRoutes, { service: service as never });
  return { app, service };
};

describe('whatsappWebhookRoutes', () => {
  it('keeps the legacy WAPI webhook and exposes the canonical WAPI route', async () => {
    const { app, service } = await build();

    const legacy = await app.inject({
      method: 'POST',
      url: whatsappWebhookPath,
      payload: { event: 'webhookReceived' },
      headers: { 'x-webhook-secret': 'test-wapi-webhook-secret-32-characters' },
    });
    const canonical = await app.inject({
      method: 'POST',
      url: canonicalWapiWhatsAppWebhookPath,
      payload: { event: 'webhookReceived' },
      headers: { authorization: 'Bearer test-wapi-webhook-secret-32-characters' },
    });

    expect(legacy.statusCode).toBe(200);
    expect(canonical.statusCode).toBe(200);
    expect(service.ingestWhatsappInbound).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('rejects a WAPI webhook without the configured secret', async () => {
    const { app, service } = await build();
    const response = await app.inject({
      method: 'POST',
      url: canonicalWapiWhatsAppWebhookPath,
      payload: { event: 'webhookReceived', phone: '5511999999999' },
    });
    expect(response.statusCode).toBe(401);
    expect(service.ingestWhatsappInbound).not.toHaveBeenCalled();
    await app.close();
  });

  it('passes Meta verification to the tenant-scoped webhook public id', async () => {
    const { app, service } = await build();

    const accepted = await app.inject({
      method: 'GET',
      url: `${canonicalMeta('hook-a')}?hub.mode=subscribe&hub.verify_token=verify-a&hub.challenge=abc123`,
    });
    service.verifyMetaWebhook.mockResolvedValueOnce(null);
    const rejected = await app.inject({
      method: 'GET',
      url: `${legacyMeta('hook-a')}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`,
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toBe('abc123');
    expect(rejected.statusCode).toBe(403);
    expect(service.verifyMetaWebhook).toHaveBeenCalledWith('hook-a', {
      mode: 'subscribe',
      verifyToken: 'verify-a',
      challenge: 'abc123',
    });
    await app.close();
  });

  it('passes the exact raw body and signature to tenant-scoped Meta ingestion', async () => {
    const { app, service } = await build();
    const rawBody = '{\n  "entry": [\n    { "changes": [] }\n  ]\n}';

    const response = await app.inject({
      method: 'POST',
      url: canonicalMeta('hook-a'),
      payload: rawBody,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=signature-a',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(service.ingestMetaWebhook).toHaveBeenCalledWith('hook-a', rawBody, { entry: [{ changes: [] }] }, 'sha256=signature-a');
    await app.close();
  });
});
