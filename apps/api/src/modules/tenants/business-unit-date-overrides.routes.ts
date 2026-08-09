import {
  BusinessUnitDateOverrideDaySchema,
  BusinessUnitDateOverridesResponseSchema,
  BusinessUnitDateOverrideStatusResponseSchema,
  ReplaceBusinessUnitDateOverrideRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type BusinessUnitDateOverridesService } from './business-unit-date-overrides.service.js';
import { tenantContextPlugin } from './tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';

interface Options {
  service: BusinessUnitDateOverridesService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}

const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const UnitParamsSchema = z.object({ publicId: z.uuid() }).strict();
const DateParamsSchema = UnitParamsSchema.extend({ date: DateParam }).strict();
const RangeQuerySchema = z.object({ from: DateParam, to: DateParam }).strict();
const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: r.auth.user.id,
  sessionId: r.auth.session.id,
});

export const businessUnitDateOverridesRoutes: FastifyPluginAsyncZod<Options> = async (
  app,
  options,
) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });

  app.get(
    '/tenant/units/:publicId/date-overrides',
    {
      schema: {
        params: UnitParamsSchema,
        querystring: RangeQuerySchema,
        response: { 200: BusinessUnitDateOverridesResponseSchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'unit.read');
      return options.service.list(
        request.tenant.id,
        request.params.publicId,
        request.query.from,
        request.query.to,
      );
    },
  );

  app.put(
    '/tenant/units/:publicId/date-overrides/:date',
    {
      schema: {
        params: DateParamsSchema,
        body: ReplaceBusinessUnitDateOverrideRequestSchema,
        response: { 200: BusinessUnitDateOverrideDaySchema },
      },
    },
    (request) => {
      options.authService.requirePermission(request.tenant, 'unit.update');
      return options.service.replace(
        request.tenant.id,
        request.params.publicId,
        request.params.date,
        request.body,
        actor(request),
      );
    },
  );

  app.delete(
    '/tenant/units/:publicId/date-overrides/:date',
    {
      schema: {
        params: DateParamsSchema,
        response: { 200: BusinessUnitDateOverrideStatusResponseSchema },
      },
    },
    async (request) => {
      options.authService.requirePermission(request.tenant, 'unit.update');
      await options.service.remove(
        request.tenant.id,
        request.params.publicId,
        request.params.date,
        actor(request),
      );
      return { success: true } as const;
    },
  );
};
