import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type WhatsAppProviderConfigService } from './whatsapp-provider-config.service.js';
import { platformAuthenticationPlugin } from './platform-auth.plugin.js';
import { type PlatformService } from './platform.service.js';
import { type AuthService } from '../auth/auth.service.js';

export const whatsappProviderConfigRoutes: FastifyPluginAsyncZod<{ service: WhatsAppProviderConfigService; platformService: PlatformService; authService: AuthService; cookieName: string }> = async (app, o) => {
  await app.register(platformAuthenticationPlugin, { platformService: o.platformService, authService: o.authService, cookieName: o.cookieName });
  const provider = z.enum(['EVOLUTION', 'META', 'WAPI']);
  app.get('/platform/settings/whatsapp/providers', async (r) => { o.platformService.requirePermission(r.platformAuth, 'platform.commercial_policy.manage'); return o.service.list(); });
  app.put('/platform/settings/whatsapp/providers/:provider', { schema: { params: z.object({ provider }), body: z.object({ enabled: z.boolean(), baseUrl: z.string().url().optional(), apiKey: z.string().min(8).optional() }) } }, async (r) => { o.platformService.requirePermission(r.platformAuth, 'platform.commercial_policy.manage'); return o.service.update(r.params.provider, { enabled: r.body.enabled, ...(r.body.baseUrl !== undefined ? { baseUrl: r.body.baseUrl } : {}), ...(r.body.apiKey !== undefined ? { apiKey: r.body.apiKey } : {}) }); });
  app.post('/platform/settings/whatsapp/providers/:provider/test', { schema: { params: z.object({ provider }) } }, async (r) => { o.platformService.requirePermission(r.platformAuth, 'platform.commercial_policy.manage'); return o.service.test(r.params.provider); });
};
