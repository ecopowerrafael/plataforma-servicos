import {
  AppointmentPublicSchema,
  CancelTreatmentPlanRequestSchema,
  CreateTreatmentPlanRequestSchema,
  CreateTreatmentSessionRequestSchema,
  TreatmentPlanListResponseSchema,
  TreatmentPlanPublicSchema,
  UpdateTreatmentPlanRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type AppointmentService } from './appointment.service.js';
import { type TreatmentPlanService } from './treatment-plan.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AuthService } from '../auth/auth.service.js';
import { type CustomerAuthService } from '../customers/customer-auth.service.js';
import { type ProfessionalService } from '../professionals/professional.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

interface Options {
  service: TreatmentPlanService;
  appointments: AppointmentService;
  professionals: ProfessionalService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
}

interface CustomerOptions {
  service: TreatmentPlanService;
  authService: CustomerAuthService;
  cookieName: string;
}

const PublicIdParamsSchema = z.object({ publicId: z.uuid() }).strict();
const CustomerQuerySchema = z.object({ customerPublicId: z.uuid() }).strict();
const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(63) }).strict();
const actor = (request: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: request.auth.user.id,
  sessionId: request.auth.session.id,
});

/**
 * Planos no painel e no Professional App. O profissional só enxerga e opera os
 * próprios planos: a identidade vem do backend, nunca do corpo da requisição.
 */
export const treatmentPlanRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });

  /** `undefined` para quem administra a agenda; o próprio id para o profissional. */
  const scope = async (request: {
    tenant: Parameters<AuthService['requirePermission']>[0];
    auth: { user: { id: bigint } };
  }) => {
    if (request.tenant.membership.permissions.includes('appointment.read')) return undefined;
    options.authService.requirePermission(request.tenant, 'professional.self.read');
    return options.professionals.myId(request.tenant.id, request.auth.user.id);
  };

  app.get(
    '/tenant/treatment-plans',
    {
      schema: {
        querystring: CustomerQuerySchema.partial(),
        response: { 200: TreatmentPlanListResponseSchema },
      },
    },
    async (request) => {
      const professionalId = await scope(request);
      if (professionalId !== undefined)
        return options.service.listForProfessional(request.tenant.id, professionalId);
      return options.service.listForCustomerPublicId(
        request.tenant.id,
        request.query.customerPublicId,
      );
    },
  );

  app.get(
    '/tenant/treatment-plans/:publicId',
    { schema: { params: PublicIdParamsSchema, response: { 200: TreatmentPlanPublicSchema } } },
    async (request) => {
      const professionalId = await scope(request);
      return options.service.get(request.tenant.id, request.params.publicId, professionalId);
    },
  );

  app.get(
    '/tenant/appointments/:publicId/treatment-plan',
    {
      schema: {
        params: PublicIdParamsSchema,
        response: { 200: TreatmentPlanPublicSchema.nullable() },
      },
    },
    async (request) => {
      const professionalId = await scope(request);
      return options.service.getByAppointment(
        request.tenant.id,
        request.params.publicId,
        professionalId,
      );
    },
  );

  app.post(
    '/tenant/treatment-plans',
    {
      schema: {
        body: CreateTreatmentPlanRequestSchema,
        response: { 201: TreatmentPlanPublicSchema },
      },
    },
    async (request, reply) => {
      const professionalId = await scope(request);
      const plan = await options.service.createFromEvaluation(
        request.tenant.id,
        request.body,
        actor(request),
        professionalId,
      );
      return reply.status(201).send(plan);
    },
  );

  app.patch(
    '/tenant/treatment-plans/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: UpdateTreatmentPlanRequestSchema,
        response: { 200: TreatmentPlanPublicSchema },
      },
    },
    async (request) => {
      const professionalId = await scope(request);
      return options.service.update(
        request.tenant.id,
        request.params.publicId,
        request.body,
        actor(request),
        professionalId,
      );
    },
  );

  app.post(
    '/tenant/treatment-plans/:publicId/approve',
    { schema: { params: PublicIdParamsSchema, response: { 200: TreatmentPlanPublicSchema } } },
    async (request) => {
      const professionalId = await scope(request);
      return options.service.approve(
        request.tenant.id,
        request.params.publicId,
        actor(request),
        professionalId,
      );
    },
  );

  app.post(
    '/tenant/treatment-plans/:publicId/cancel',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: CancelTreatmentPlanRequestSchema,
        response: { 200: TreatmentPlanPublicSchema },
      },
    },
    async (request) => {
      const professionalId = await scope(request);
      return options.service.cancel(
        request.tenant.id,
        request.params.publicId,
        request.body.reason,
        actor(request),
        professionalId,
      );
    },
  );

  app.post(
    '/tenant/professionals/me/treatment-plans/:publicId/sessions',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: CreateTreatmentSessionRequestSchema,
        response: { 201: AppointmentPublicSchema },
      },
    },
    async (request, reply) => {
      // O profissional agenda a sessão do próprio plano sem depender das
      // permissões administrativas: a identidade vem do backend e o cliente,
      // o serviço e o profissional vêm do plano, não do corpo.
      options.authService.requirePermission(request.tenant, 'professional.self.update');
      const professionalId = await options.professionals.myId(
        request.tenant.id,
        request.auth.user.id,
      );
      const plan = await options.service.get(
        request.tenant.id,
        request.params.publicId,
        professionalId,
      );
      const appointment = await options.appointments.create(
        request.tenant.id,
        {
          customerPublicId: plan.customerPublicId,
          servicePublicId: plan.servicePublicId,
          professionalPublicId: plan.professionalPublicId,
          treatmentPlanPublicId: plan.publicId,
          startsAt: request.body.startsAt,
          ...(request.body.unitPublicId === undefined || request.body.unitPublicId === null
            ? {}
            : { unitPublicId: request.body.unitPublicId }),
          ...(request.body.notes === undefined || request.body.notes === null
            ? {}
            : { notes: request.body.notes }),
          source: 'PROFESSIONAL_APP',
        },
        actor(request),
      );
      return reply.status(201).send(appointment);
    },
  );
};

/** Área do cliente: leitura dos próprios tratamentos. */
export const customerTreatmentPlanRoutes: FastifyPluginAsyncZod<CustomerOptions> = (
  app,
  options,
) => {
  app.get(
    '/public/sites/:slug/customer/treatment-plans',
    { schema: { params: SlugParamsSchema, response: { 200: TreatmentPlanListResponseSchema } } },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.listForCustomer(session.tenantId, session.customer.id);
    },
  );
  return Promise.resolve();
};
