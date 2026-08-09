import {
  CreateInvitationRequestSchema,
  InvitationListResponseSchema,
  InvitationPublicSchema,
  MembershipListPaginatedResponseSchema,
  MembershipListQuerySchema,
  MembershipPublicSchema,
  UpdateMembershipRequestSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AuthService } from './auth.service.js';
import { requestMetadata } from './request-context.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

interface MembershipRoutesOptions {
  service: AuthService;
  cookieName: string;
  client?: PrismaClient;
}

const MembershipParamsSchema = z.object({ membershipPublicId: z.uuid() });
const InvitationParamsSchema = z.object({ invitationPublicId: z.uuid() });

export const membershipRoutes: FastifyPluginAsyncZod<MembershipRoutesOptions> = async (
  app,
  options,
) => {
  await app.register(tenantContextPlugin, {
    authService: options.service,
    cookieName: options.cookieName,
    client: options.client,
  });

  app.post(
    '/tenant/members/invitations',
    {
      schema: { body: CreateInvitationRequestSchema, response: { 201: InvitationPublicSchema } },
    },
    async (request, reply) => {
      options.service.requirePermission(request.tenant, 'membership.invite');
      const invitation = await options.service.createInvitation(
        request.auth,
        request.tenant,
        request.body,
        requestMetadata(request),
      );
      return reply.status(201).send(invitation);
    },
  );

  app.get(
    '/tenant/members',
    {
      schema: {
        querystring: MembershipListQuerySchema,
        response: { 200: MembershipListPaginatedResponseSchema },
      },
    },
    async (request) => {
      options.service.requirePermission(request.tenant, 'membership.read');
      return options.service.listMembers(request.tenant.id, request.query);
    },
  );

  app.get(
    '/tenant/members/invitations',
    { schema: { response: { 200: InvitationListResponseSchema } } },
    async (request) => {
      options.service.requirePermission(request.tenant, 'membership.read');
      const invitations = await options.service.listInvitations(request.tenant.id);
      return { invitations };
    },
  );

  app.delete(
    '/tenant/members/invitations/:invitationPublicId',
    {
      schema: {
        params: InvitationParamsSchema,
        response: { 200: SuccessResponseSchema },
      },
    },
    async (request) => {
      options.service.requirePermission(request.tenant, 'membership.invite');
      await options.service.revokeInvitation(
        request.auth,
        request.tenant,
        request.params.invitationPublicId,
        requestMetadata(request),
      );
      return { success: true } as const;
    },
  );

  app.patch(
    '/tenant/members/:membershipPublicId',
    {
      schema: {
        params: MembershipParamsSchema,
        body: UpdateMembershipRequestSchema,
        response: { 200: MembershipPublicSchema },
      },
    },
    async (request) => {
      options.service.requirePermission(request.tenant, 'membership.update');
      if (request.body.status !== undefined) {
        options.service.requirePermission(request.tenant, 'membership.suspend');
      }
      return options.service.updateMembership(
        request.tenant,
        request.params.membershipPublicId,
        request.body,
        request.auth,
        requestMetadata(request),
      );
    },
  );
};
