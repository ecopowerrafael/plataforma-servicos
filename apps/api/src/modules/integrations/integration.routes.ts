import {
  ExternalIntegrationListSchema,
  ExternalIntegrationSchema,
  SuccessResponseSchema,
  UpsertExternalIntegrationSchema,
  UpsertWhatsAppConfigSchema,
  WhatsAppButtonTestRequestSchema,
  WhatsAppButtonTestResponseSchema,
  WhatsAppConfigSchema,
  WhatsAppConnectionSchema,
  WhatsAppConnectionTestSchema,
  WhatsAppControlTestResponseSchema,
  WhatsAppConnectionTestRequestSchema,
  WhatsAppInstanceDiagnosticsSchema,
  WhatsAppQrCodeSchema,
  WhatsAppLastInboundEventSchema,
  WhatsAppWebhookConfigResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type IntegrationService } from './integration.service.js';
import { type WhatsAppProvisioningService } from './whatsapp-provisioning.service.js';
import { whatsappWebhookPath } from './whatsapp-webhook.routes.js';
import { whatsappAssistantConfigRoutes } from './whatsapp-assistant-config.routes.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AuthService } from '../auth/auth.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

const params = z.object({ publicId: z.uuid() }).strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});
export const integrationRoutes: FastifyPluginAsyncZod<{
  service: IntegrationService;
  provisioning?: WhatsAppProvisioningService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });
  if (options.client !== undefined) {
    await app.register(whatsappAssistantConfigRoutes, {
      authService: options.authService,
      cookieName: options.cookieName,
      client: options.client,
    });
  }
  app.get(
    '/tenant/integrations/whatsapp',
    { schema: { response: { 200: WhatsAppConfigSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.read');
      return options.service.whatsapp(request.tenant.id);
    },
  );
  app.put(
    '/tenant/integrations/whatsapp',
    { schema: { body: UpsertWhatsAppConfigSchema, response: { 200: WhatsAppConfigSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      return options.service.updateWhatsapp(request.tenant.id, request.body, actor(request));
    },
  );
  /**
   * Conexão do WhatsApp pelo painel. Todas as rotas resolvem a instância pela
   * sessão autenticada — o frontend nunca informa instanceId nem token, e
   * nenhuma credencial do provedor volta na resposta.
   */
  const provisioning = () => {
    if (options.provisioning === undefined)
      throw new AppError({
        code: 'WHATSAPP_PROVIDER_UNAVAILABLE',
        message: 'A conexão com o WhatsApp está indisponível no momento.',
        statusCode: 503,
      });
    return options.provisioning;
  };
  const logged = (
    request: { log: { info: (payload: object, message: string) => void }; tenant: { publicId: string } },
    operation: string,
  ) => {
    // Log técnico sem credencial, token, chave mestra ou QR.
    request.log.info(
      { operation, tenantPublicId: request.tenant.publicId },
      'Operação de conexão do WhatsApp',
    );
  };

  app.get(
    '/tenant/integrations/whatsapp/status',
    { schema: { response: { 200: WhatsAppConnectionSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.read');
      const service = provisioning();
      const current = await service.current(request.tenant.id);
      if (!current.provisioned) return current;
      logged(request, 'whatsapp_status_refresh');
      return service.refreshStatus(request.tenant.id);
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/instance',
    { schema: { response: { 200: WhatsAppConnectionSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      logged(request, 'whatsapp_instance_create');
      return provisioning().connect(request.tenant.id);
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/qr',
    { schema: { response: { 200: WhatsAppQrCodeSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      logged(request, 'whatsapp_qr_code');
      const { qrCode, view } = await provisioning().qrCode(request.tenant.id);
      return { qrCode, connection: view };
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/reconnect',
    { schema: { response: { 200: WhatsAppQrCodeSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      logged(request, 'whatsapp_reconnect');
      const { qrCode, view } = await provisioning().reconnect(request.tenant.id);
      return { qrCode, connection: view };
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/disconnect',
    { schema: { response: { 200: WhatsAppConnectionSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      logged(request, 'whatsapp_disconnect');
      return provisioning().disconnect(request.tenant.id);
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/test',
    { schema: { body: WhatsAppConnectionTestRequestSchema, response: { 200: WhatsAppConnectionTestSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      const started=Date.now();const result=await options.service.testWhatsapp(request.tenant.id,request.body);request.log.info({operation:'whatsapp_connection_test',tenantPublicId:request.tenant.publicId,httpStatus:result.httpStatus,externalCode:result.externalCode,message:result.message,durationMs:Date.now()-started},'Diagnóstico sanitizado do teste de WhatsApp');return result;
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/webhook-config',
    { schema: { response: { 200: WhatsAppWebhookConfigResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      const forwardedProto = request.headers['x-forwarded-proto'];
      const protocol =
        (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0]?.trim() : undefined) ??
        request.protocol;
      const host = request.headers.host ?? '';
      const url = `${protocol}://${host}${whatsappWebhookPath}`;
      const result = await options.service.configureWhatsappWebhook(
        request.tenant.id,
        url,
        actor(request),
      );
      request.log.info(
        {
          operation: 'whatsapp_webhook_config',
          tenantPublicId: request.tenant.publicId,
          receivedStatus: result.received.httpStatus,
          statusWebhookStatus: result.status.httpStatus,
          webhookUrl: result.webhookUrl,
        },
        'Configuração sanitizada do webhook de WhatsApp',
      );
      return result;
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/button-test',
    {
      schema: {
        body: WhatsAppButtonTestRequestSchema,
        response: { 200: WhatsAppButtonTestResponseSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      const result = await options.service.sendWhatsappButtonTest(
        request.tenant.id,
        request.body.phone,
        actor(request),
      );
      request.log.info(
        {
          operation: 'whatsapp_button_test',
          tenantPublicId: request.tenant.publicId,
          httpStatus: result.httpStatus,
          errorCode: result.errorCode,
          messageStatus: result.status,
          externalMessageId: result.externalMessageId,
        },
        'Diagnóstico sanitizado do envio com botões',
      );
      return result;
    },
  );
  app.post(
    '/tenant/integrations/whatsapp/control-test',
    {
      schema: {
        body: WhatsAppButtonTestRequestSchema,
        response: { 200: WhatsAppControlTestResponseSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      const result = await options.service.sendWhatsappControlTest(
        request.tenant.id,
        request.body.phone,
        actor(request),
      );
      request.log.info(
        {
          operation: 'whatsapp_control_test',
          tenantPublicId: request.tenant.publicId,
          phoneCheckStatus: result.phoneCheck.httpStatus,
          textStatus: result.text.httpStatus,
          textCode: result.text.externalCode,
        },
        'Diagnóstico sanitizado do envio de controle',
      );
      return result;
    },
  );
  app.get(
    '/tenant/integrations/whatsapp/diagnostics',
    { schema: { response: { 200: WhatsAppInstanceDiagnosticsSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      return options.service.whatsappInstanceDiagnostics(request.tenant.id);
    },
  );
  app.get(
    '/tenant/integrations/whatsapp/last-event',
    { schema: { response: { 200: WhatsAppLastInboundEventSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.read');
      return options.service.lastWhatsappInboundEvent(request.tenant.id);
    },
  );
  app.get(
    '/tenant/integrations/external',
    { schema: { response: { 200: ExternalIntegrationListSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.read');
      return options.service.list(request.tenant.id);
    },
  );
  app.post(
    '/tenant/integrations/external',
    {
      schema: {
        body: UpsertExternalIntegrationSchema,
        response: { 201: ExternalIntegrationSchema },
      },
    },
    async (request, reply) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      return reply
        .status(201)
        .send(await options.service.save(request.tenant.id, null, request.body, actor(request)));
    },
  );
  app.put(
    '/tenant/integrations/external/:publicId',
    {
      schema: {
        params,
        body: UpsertExternalIntegrationSchema,
        response: { 200: ExternalIntegrationSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      return options.service.save(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
  app.delete(
    '/tenant/integrations/external/:publicId',
    { schema: { params, response: { 200: SuccessResponseSchema } } },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'integration.manage');
      await options.service.remove(request.tenant.id, request.params.publicId, actor(request));
      return { success: true } as const;
    },
  );
};
