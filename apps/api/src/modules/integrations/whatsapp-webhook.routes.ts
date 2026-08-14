import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type IntegrationService } from './integration.service.js';

/** Caminho público do webhook — compartilhado com a rota que registra a URL na instância. */
export const whatsappWebhookPath = '/public/integrations/whatsapp/webhook';

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
  app.post(whatsappWebhookPath, async (request, reply) => {
    const result = await options.service.ingestWhatsappInbound(request.body);
    request.log.info(
      { operation: 'whatsapp_webhook_received', ...result },
      'Evento de WhatsApp recebido',
    );
    return reply.status(200).send({ received: true, ...result });
  });
};
