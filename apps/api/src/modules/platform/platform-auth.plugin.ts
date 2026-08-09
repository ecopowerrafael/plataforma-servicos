import { type FastifyPluginCallback } from 'fastify';
import plugin from 'fastify-plugin';

import { type PlatformAuthContext, type PlatformService } from './platform.service.js';
import { type AuthService } from '../auth/auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    platformAuth: PlatformAuthContext;
  }
}

interface PlatformAuthenticationOptions {
  authService: AuthService;
  platformService: PlatformService;
  cookieName: string;
}

const platformAuthenticationContext: FastifyPluginCallback<PlatformAuthenticationOptions> = (
  app,
  options,
  done,
) => {
  if (!app.hasRequestDecorator('platformAuth')) app.decorateRequest('platformAuth');
  app.addHook('preHandler', async (request) => {
    const auth = await options.authService.authenticate(request.cookies[options.cookieName]);
    request.platformAuth = Object.freeze(await options.platformService.resolveAuth(auth));
  });
  done();
};

export const platformAuthenticationPlugin = plugin(platformAuthenticationContext, {
  name: 'platform-authentication-context',
});
