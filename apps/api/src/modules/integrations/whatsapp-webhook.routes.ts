import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type IntegrationService } from './integration.service.js';

/** Caminho público do webhook — compartilhado com a rota que registra a URL na instância. */
export const whatsappWebhookPath = '/public/integrations/whatsapp/webhook';
export const canonicalWapiWhatsAppWebhookPath = '/webhooks/whatsapp/wapi';
export const canonicalMetaWhatsAppWebhookPath = '/webhooks/whatsapp/meta';
export const wapiWhatsAppWebhookPath = '/public/webhooks/whatsapp/wapi';
export const metaWhatsAppWebhookPath = '/public/webhooks/whatsapp/meta';

const metaRawPayload = (body: unknown) => (typeof body === 'string' ? body : JSON.stringify(body ?? {}));

interface RawBodyRequest {
  rawBody?: string;
}

const isMetaWebhookPost = (method: string, url: string) =>
  method === 'POST' &&
  (url === canonicalMetaWhatsAppWebhookPath || url === metaWhatsAppWebhookPath);

const verifyMetaSignature = (
  rawBody: string | undefined,
  body: unknown,
  signatureHeader: string | string[] | undefined,
) => {
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  if (appSecret === undefined || appSecret.trim() === '') return false;
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (signature === undefined || !signature.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody ?? metaRawPayload(body)).digest('hex');
  const received = signature.slice('sha256='.length);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
};

/**
 * Recepção do webhook de WhatsApp. Responde 2xx sempre que o corpo é legível,
 * para o provedor não reenfileirar o evento; o resultado real do processamento
 * vai no corpo da resposta e no log sanitizado.
 */
export const whatsappWebhookRoutes: FastifyPluginAsyncZod<{ service: IntegrationService }> = async (
  app,
  options,
) => {
  await Promise.resolve();
  app.addHook('preParsing', async (request, _reply, payload) => {
    if (!isMetaWebhookPost(request.method, request.url)) return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    (request as FastifyRequest & RawBodyRequest).rawBody = raw.toString('utf8');
    const stream = Readable.from(raw);
    (stream as Readable & { receivedEncodedLength?: number }).receivedEncodedLength = raw.length;
    return stream;
  });

  const ingestWapi = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await options.service.ingestWhatsappInbound(request.body);
    request.log.info(
      { operation: 'whatsapp_wapi_webhook_received', ...result },
      'Evento de WhatsApp W-API recebido',
    );
    return reply.status(200).send({ received: true, ...result });
  };

  app.post(whatsappWebhookPath, ingestWapi);
  app.post(canonicalWapiWhatsAppWebhookPath, ingestWapi);
  app.post(wapiWhatsAppWebhookPath, ingestWapi);

  const verifyMetaWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
    const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN;
    if (
      query['hub.mode'] === 'subscribe' &&
      verifyToken !== undefined &&
      query['hub.verify_token'] === verifyToken
    ) {
      return reply.status(200).send(query['hub.challenge'] ?? '');
    }
    return reply.status(403).send({ code: 'META_WEBHOOK_VERIFY_FAILED' });
  };

  const ingestMeta = async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = (request as FastifyRequest & RawBodyRequest).rawBody;
    if (!verifyMetaSignature(rawBody, request.body, request.headers['x-hub-signature-256'])) {
      return reply.status(403).send({ code: 'META_WEBHOOK_SIGNATURE_INVALID' });
    }
    const result = await options.service.ingestWhatsappInboundForProvider('META', request.body);
    request.log.info(
      { operation: 'whatsapp_meta_webhook_received', ...result },
      'Evento de WhatsApp Meta recebido',
    );
    return reply.status(200).send({ received: true, ...result });
  };

  app.get(canonicalMetaWhatsAppWebhookPath, verifyMetaWebhook);
  app.get(metaWhatsAppWebhookPath, verifyMetaWebhook);
  app.post(canonicalMetaWhatsAppWebhookPath, ingestMeta);
  app.post(metaWhatsAppWebhookPath, ingestMeta);
};
