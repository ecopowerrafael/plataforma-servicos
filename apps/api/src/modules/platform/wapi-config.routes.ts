import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type WapiConfigService } from './wapi-config.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  wapiConfigService: WapiConfigService;
  authService: AuthService;
}

export const wapiConfigRoutes: FastifyPluginAsyncZod<Options> = async (app, o) => {
  app.get('/platform/settings/wapi', { schema: { response: { 200: z.object({
    configured: z.boolean(),
    source: z.enum(['database', 'environment', 'none']),
    active: z.boolean(),
    updatedAt: z.string().datetime().optional(),
  }) } } }, async () => {
    return o.wapiConfigService.getConfig();
  });

  app.put('/platform/settings/wapi', { schema: { body: z.object({
    masterApiKey: z.string().trim().min(8),
  }) } }, async (r) => {
    o.authService.requirePlatformAdmin(r);
    return o.wapiConfigService.setConfig(r.body.masterApiKey);
  });

  app.post('/platform/settings/wapi/test', {}, async (r) => {
    o.authService.requirePlatformAdmin(r);
    return o.wapiConfigService.testConfig();
  });
};
