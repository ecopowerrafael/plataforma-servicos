import { type FastifyPluginCallback } from 'fastify';
import plugin from 'fastify-plugin';

import { type AuthService } from './auth.service.js';
import { type AuthRequestContext } from './identity.repository.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthRequestContext;
  }
}

interface AuthenticationPluginOptions {
  service: AuthService;
  cookieName: string;
}

const authenticationContext: FastifyPluginCallback<AuthenticationPluginOptions> = (
  app,
  options,
  done,
) => {
  if (!app.hasRequestDecorator('auth')) app.decorateRequest('auth');
  app.addHook('preHandler', async (request) => {
    request.auth = Object.freeze(
      await options.service.authenticate(request.cookies[options.cookieName]),
    );
  });
  done();
};

export const authenticationPlugin = plugin(authenticationContext, {
  name: 'authentication-context',
});
