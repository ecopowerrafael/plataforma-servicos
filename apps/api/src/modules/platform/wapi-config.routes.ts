import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type WapiConfigService } from './wapi-config.service.js';
import { platformAuthenticationPlugin } from './platform-auth.plugin.js';
import { type PlatformService } from './platform.service.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  wapiConfigService: WapiConfigService;
  platformService: PlatformService;
  authService: AuthService;
  cookieName: string;
}

export const wapiConfigRoutes: FastifyPluginAsyncZod<Options> = async (app, o) => {
  await app.register(platformAuthenticationPlugin, {
    platformService: o.platformService,
    authService: o.authService,
    cookieName: o.cookieName,
  });

  app.get('/platform/settings/wapi', async (request) => {
    o.platformService.requirePermission(request.platformAuth, 'platform.dashboard.read');
    return o.wapiConfigService.getConfig();
  });

  app.put('/platform/settings/wapi', { schema: { body: z.object({
    masterApiKey: z.string().trim().min(8),
  }) } }, async (r) => {
    o.platformService.requirePermission(r.platformAuth, 'platform.dashboard.read');
    return o.wapiConfigService.setConfig(r.body.masterApiKey);
  });

  app.post('/platform/settings/wapi/test', async (r) => {
    o.platformService.requirePermission(r.platformAuth, 'platform.dashboard.read');
    return o.wapiConfigService.testConfig();
  });
};
