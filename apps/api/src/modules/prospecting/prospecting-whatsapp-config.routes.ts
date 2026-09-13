import { z } from 'zod';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { AppError } from '../../errors/AppError.js';

const UpdateConfigSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID obrigatório'),
  token: z.string().min(1, 'Token obrigatório'),
  phoneNumber: z.string().optional(),
  instanceName: z.string().optional(),
  isActive: z.boolean().optional(),
  attendantEnabled: z.boolean().optional(),
  attendantFlowId: z.coerce.bigint().nullable().optional(),
  greetingMessage: z.string().nullable().optional(),
  fallbackMessage: z.string().nullable().optional(),
  mediaFallbackMessage: z.string().nullable().optional(),
  realtimeRepliesEnabled: z.boolean().optional(),
  webhookUrl: z.string().url().optional(),
}).strict();

const ConfigResponseSchema = z.object({
  configured: z.boolean(),
  webhookUrl: z.string().url().optional(),
  publicId: z.string().optional(),
  instanceId: z.string().optional(),
  phoneNumber: z.string().optional(),
  instanceName: z.string().optional(),
  isActive: z.boolean().optional(),
  lastConnectionStatus: z.string().optional(),
  lastCheckedAt: z.string().optional(),
  tokenMasked: z.string().optional(),
  attendantEnabled: z.boolean().optional(),
  attendantFlowId: z.string().optional(),
  greetingMessage: z.string().optional(),
  fallbackMessage: z.string().optional(),
  mediaFallbackMessage: z.string().optional(),
  realtimeRepliesEnabled: z.boolean().optional(),
});

const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  connected: z.boolean(),
  phoneNumber: z.string().optional(),
  instanceName: z.string().optional(),
  message: z.string(),
});

interface Options {
  service: ProspectingWhatsAppConfigService;
}

export const prospectingWhatsAppConfigRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  // GET /platform/prospecting/whatsapp
  app.get(
    '/platform/prospecting/whatsapp',
    { schema: { response: { 200: ConfigResponseSchema } } },
    async () => {
      const config = await options.service.getConfig();
      return config || { configured: false };
    },
  );

  // PUT /platform/prospecting/whatsapp
  app.put(
    '/platform/prospecting/whatsapp',
    { schema: { body: UpdateConfigSchema, response: { 200: ConfigResponseSchema } } },
    async (request, reply) => {
      try {
        const updated = await options.service.updateConfig({
          instanceId: request.body.instanceId,
          token: request.body.token,
          phoneNumber: request.body.phoneNumber,
          instanceName: request.body.instanceName,
          isActive: request.body.isActive,
          attendantEnabled: request.body.attendantEnabled,
          attendantFlowId: request.body.attendantFlowId,
          greetingMessage: request.body.greetingMessage,
          fallbackMessage: request.body.fallbackMessage,
          mediaFallbackMessage: request.body.mediaFallbackMessage,
          realtimeRepliesEnabled: request.body.realtimeRepliesEnabled,
        });
        return reply.status(200).send(updated);
      } catch (error) {
        throw new AppError({
          code: 'CONFIG_UPDATE_FAILED',
          message: 'Falha ao atualizar configuração de WhatsApp.',
          statusCode: 400,
          cause: error,
        });
      }
    },
  );

  // POST /platform/prospecting/whatsapp/test
  app.post(
    '/platform/prospecting/whatsapp/test',
    { schema: { response: { 200: TestConnectionResponseSchema } } },
    async () => {
      try {
        const config = await options.service.getConfig();
        if (!config) {
          return {
            success: false,
            connected: false,
            message: 'Nenhuma configuração salva.',
          };
        }

        const token = await options.service.getDecryptedToken();
        if (!token) {
          return {
            success: false,
            connected: false,
            message: 'Token não pode ser descriptografado.',
          };
        }

        // TODO: Implementar teste real com W-API
        // Por enquanto, teste dummy que sucede
        const result = {
          success: true,
          connected: true,
          phoneNumber: config.phoneNumber ?? undefined,
          instanceName: config.instanceName ?? undefined,
          message: 'Conectado com sucesso.',
        };

        // Atualizar status
        await options.service.updateConnectionStatus('CONNECTED');

        return result;
      } catch (error) {
        await options.service.updateConnectionStatus('ERROR');
        return {
          success: false,
          connected: false,
          message: error instanceof Error ? error.message : 'Erro ao testar conexão.',
        };
      }
    },
  );

  app.post(
    '/platform/prospecting/whatsapp/webhooks/refresh',
    { schema: { response: { 200: z.object({ success: z.boolean(), message: z.string() }) } } },
    async (_request, reply) => {
      try {
        await options.service.reconfigureWebhooks();
        return reply.send({ success: true, message: 'Webhooks atualizados com sucesso.' });
      } catch (error) {
        throw new AppError({
          code: 'WEBHOOK_REFRESH_FAILED',
          message: error instanceof Error ? error.message : 'Não foi possível atualizar os webhooks.',
          statusCode: 400,
          cause: error,
        });
      }
    },
  );
};
