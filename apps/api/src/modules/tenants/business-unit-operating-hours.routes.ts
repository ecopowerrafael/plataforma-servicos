import {
  BusinessUnitOperatingHoursResponseSchema,
  ReplaceBusinessUnitOperatingHoursRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type BusinessUnitOperatingHoursService } from './business-unit-operating-hours.service.js';
import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  service: BusinessUnitOperatingHoursService;
  authService: AuthService;
  cookieName: string;
}

const UnitParamsSchema = z.object({ publicId: z.uuid() }).strict();
const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: r.auth.user.id,
  sessionId: r.auth.session.id,
});

export const businessUnitOperatingHoursRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
  });

  app.get(
    '/tenant/units/:publicId/operating-hours',
    {
      schema: {
        params: UnitParamsSchema,
        response: { 200: BusinessUnitOperatingHoursResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'unit.read');
      return options.service.list(request.tenant.id, request.params.publicId);
    },
  );

  app.put(
    '/tenant/units/:publicId/operating-hours',
    {
      schema: {
        params: UnitParamsSchema,
        body: ReplaceBusinessUnitOperatingHoursRequestSchema,
        response: { 200: BusinessUnitOperatingHoursResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'unit.update');
      return options.service.replace(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
      );
    },
  );
};
