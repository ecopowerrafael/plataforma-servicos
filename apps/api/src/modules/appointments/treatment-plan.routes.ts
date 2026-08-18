import {
  AppointmentPublicSchema,
  ApproveTreatmentPlanRequestSchema,
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
import { type TreatmentPlanNotificationService } from '../notifications/treatment-plan-notification.service.js';
import { type ProfessionalService } from '../professionals/professional.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';

interface Options {
  service: TreatmentPlanService;
  appointments: AppointmentService;
  professionals: ProfessionalService;
  authService: AuthService;
  cookieName: string;
  client?: PrismaClient;
  notifications?: TreatmentPlanNotificationService;
}

interface CustomerOptions {
  service: TreatmentPlanService;
  appointments: AppointmentService;
  authService: CustomerAuthService;
  cookieName: string;
  notifications?: TreatmentPlanNotificationService;
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
      // O orçamento não depende da entrega da mensagem: falhar aqui não o desfaz.
      try {
        await options.notifications?.notifyQuoteReady(request.tenant.id, plan);
      } catch {
        /* a própria fila de notificações registra o erro */
      }
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

/**
 * Área do cliente. Toda autorização vem da sessão (`CustomerAuth`) somada ao
 * tenant e ao dono do plano: alterar o publicId na URL nunca dá acesso ao
 * tratamento de outro cliente.
 */
export const customerTreatmentPlanRoutes: FastifyPluginAsyncZod<CustomerOptions> = (
  app,
  options,
) => {
  const CustomerPlanParamsSchema = z
    .object({ slug: z.string().trim().min(1).max(63), publicId: z.uuid() })
    .strict();

  app.get(
    '/public/sites/:slug/customer/treatment-plans',
    { schema: { params: SlugParamsSchema, response: { 200: TreatmentPlanListResponseSchema } } },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.listForCustomer(session.tenantId, session.customer.id);
    },
  );

  app.get(
    '/public/sites/:slug/customer/treatment-plans/:publicId',
    { schema: { params: CustomerPlanParamsSchema, response: { 200: TreatmentPlanPublicSchema } } },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      return options.service.getForCustomer(
        session.tenantId,
        session.customer.id,
        request.params.publicId,
      );
    },
  );

  app.post(
    '/public/sites/:slug/customer/treatment-plans/:publicId/approve',
    {
      schema: {
        params: CustomerPlanParamsSchema,
        body: ApproveTreatmentPlanRequestSchema,
        response: { 200: TreatmentPlanPublicSchema },
      },
    },
    async (request) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      const result = await options.service.approveForCustomer(
        session.tenantId,
        session.customer.id,
        request.params.publicId,
      );
      // Só a transição real avisa o profissional: reenvio não duplica evento.
      if (result.changed)
        try {
          await options.notifications?.notifyApproved(session.tenantId, result.plan);
        } catch {
          /* a própria fila de notificações registra o erro */
        }
      return result.plan;
    },
  );

  app.post(
    '/public/sites/:slug/customer/treatment-plans/:publicId/sessions',
    {
      schema: {
        params: CustomerPlanParamsSchema,
        body: CreateTreatmentSessionRequestSchema,
        response: { 201: AppointmentPublicSchema },
      },
    },
    async (request, reply) => {
      const session = await options.authService.authenticate(request.cookies[options.cookieName]);
      // O plano é lido pelo dono autenticado; cliente, serviço e profissional
      // vêm dele, então o corpo não escolhe de quem é a sessão.
      const plan = await options.service.getForCustomer(
        session.tenantId,
        session.customer.id,
        request.params.publicId,
      );
      const appointment = await options.appointments.create(
        session.tenantId,
        {
          customerPublicId: plan.customerPublicId,
          servicePublicId: plan.servicePublicId,
          professionalPublicId: plan.professionalPublicId,
          treatmentPlanPublicId: plan.publicId,
          startsAt: request.body.startsAt,
          ...(request.body.unitPublicId === undefined || request.body.unitPublicId === null
            ? {}
            : { unitPublicId: request.body.unitPublicId }),
          source: 'CUSTOMER_ACCOUNT',
        },
        { userId: null, sessionId: null },
      );
      return reply.status(201).send(appointment);
    },
  );
  return Promise.resolve();
};
