import { createHmac } from 'node:crypto';

import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  canonicalMetaWhatsAppWebhookPath,
  canonicalWapiWhatsAppWebhookPath,
  metaWhatsAppWebhookPath,
  whatsappWebhookPath,
  whatsappWebhookRoutes,
} from './whatsapp-webhook.routes.js';

const build = async () => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  const service = {
    ingestWhatsappInbound: vi.fn().mockResolvedValue({ accepted: true, provider: 'WAPI' }),
    ingestWhatsappInboundForProvider: vi.fn().mockResolvedValue({ accepted: true, provider: 'META' }),
  };
  await app.register(whatsappWebhookRoutes, { service: service as never });
  return { app, service };
};

describe('whatsappWebhookRoutes', () => {
  const previousVerifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN;
  const previousAppSecret = process.env.META_WHATSAPP_APP_SECRET;

  afterEach(() => {
    process.env.META_WHATSAPP_VERIFY_TOKEN = previousVerifyToken;
    process.env.META_WHATSAPP_APP_SECRET = previousAppSecret;
  });

  it('keeps the legacy WAPI webhook and exposes the canonical WAPI route', async () => {
    const { app, service } = await build();

    const legacy = await app.inject({
      method: 'POST',
      url: whatsappWebhookPath,
      payload: { event: 'webhookReceived' },
    });
    const canonical = await app.inject({
      method: 'POST',
      url: canonicalWapiWhatsAppWebhookPath,
      payload: { event: 'webhookReceived' },
    });

    expect(legacy.statusCode).toBe(200);
    expect(canonical.statusCode).toBe(200);
    expect(service.ingestWhatsappInbound).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('answers Meta verification challenge only when verify token matches', async () => {
    process.env.META_WHATSAPP_VERIFY_TOKEN = 'verify-token';
    const { app } = await build();

    const accepted = await app.inject({
      method: 'GET',
      url: `${canonicalMetaWhatsAppWebhookPath}?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=abc123`,
    });
    const rejected = await app.inject({
      method: 'GET',
      url: `${metaWhatsAppWebhookPath}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`,
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toBe('abc123');
    expect(rejected.statusCode).toBe(403);
    await app.close();
  });

  it('rejects Meta payloads with invalid signature when app secret is configured', async () => {
    process.env.META_WHATSAPP_APP_SECRET = 'meta-secret';
    const { app, service } = await build();

    const response = await app.inject({
      method: 'POST',
      url: canonicalMetaWhatsAppWebhookPath,
      payload: { entry: [] },
      headers: { 'x-hub-signature-256': 'sha256=bad' },
    });

    expect(response.statusCode).toBe(403);
    expect(service.ingestWhatsappInboundForProvider).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects Meta POST fail-closed when app secret is not configured', async () => {
    delete process.env.META_WHATSAPP_APP_SECRET;
    const { app, service } = await build();

    const response = await app.inject({
      method: 'POST',
      url: canonicalMetaWhatsAppWebhookPath,
      payload: { entry: [] },
    });

    expect(response.statusCode).toBe(403);
    expect(service.ingestWhatsappInboundForProvider).not.toHaveBeenCalled();
    await app.close();
  });

  it('routes a valid Meta payload through the Meta provider normalizer path', async () => {
    process.env.META_WHATSAPP_APP_SECRET = 'meta-secret';
    const { app, service } = await build();
    const payload = { entry: [{ changes: [] }] };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', 'meta-secret').update(body).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: canonicalMetaWhatsAppWebhookPath,
      payload,
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
    });

    expect(response.statusCode).toBe(200);
    expect(service.ingestWhatsappInboundForProvider).toHaveBeenCalledWith('META', payload);
    await app.close();
  });

  it('validates Meta signatures against the exact raw request body', async () => {
    process.env.META_WHATSAPP_APP_SECRET = 'meta-secret';
    const { app, service } = await build();
    const rawBody = '{\n  "entry": [\n    { "changes": [] }\n  ]\n}';
    const signature = createHmac('sha256', 'meta-secret').update(rawBody).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: canonicalMetaWhatsAppWebhookPath,
      payload: rawBody,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${signature}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(service.ingestWhatsappInboundForProvider).toHaveBeenCalledWith('META', {
      entry: [{ changes: [] }],
    });
    await app.close();
  });
});
