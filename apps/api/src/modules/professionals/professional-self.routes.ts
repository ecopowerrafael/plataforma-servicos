import {
  AppointmentHistoryResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPaymentsResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusRequestSchema,
  AppointmentStatusResponseSchema,
  CalendarResponseSchema,
  CommissionListResponseSchema,
  CreatePaymentRequestSchema,
  PaymentPublicSchema,
  ProfessionalAppointmentNotesRequestSchema,
  ProfessionalCommissionResponseSchema,
  ProfessionalPublicSchema,
  UpdateMyProfessionalProfileRequestSchema,
  ProfessionalScheduleResponseSchema,
  ProfessionalServicesResponseSchema,
  ProfessionalUnavailabilityListQuerySchema,
  ProfessionalUnavailabilityListResponseSchema,
  SetProfessionalUnavailabilityStatusRequestSchema,
  UpdateProfessionalUnavailabilityRequestSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { type ProfessionalScheduleService } from './professional-schedule.service.js';
import { type ProfessionalServiceLinkService } from './professional-service.service.js';
import { type ProfessionalUnavailabilityService } from './professional-unavailability.service.js';
import { type ProfessionalService } from './professional.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type AppointmentService } from '../appointments/appointment.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { type AvailabilityService } from '../calendar/availability.service.js';
import { type PasswordService } from '../auth/password.service.js';
import { type ProfessionalCommissionService } from '../payments/professional-commission.service.js';
import { type PaymentService } from '../payments/payment.service.js';
import { tenantContextPlugin } from '../tenants/tenant-context.plugin.js';
import { addDaysToDay, resolveTimezone, zonedDayStart } from '../tenants/timezone.js';

interface Options {
  professionals: ProfessionalService;
  appointments: AppointmentService;
  schedules: ProfessionalScheduleService;
  unavailabilities: ProfessionalUnavailabilityService;
  professionalServices: ProfessionalServiceLinkService;
  availability: AvailabilityService;
  commissions?: ProfessionalCommissionService;
  payments?: PaymentService;
  authService: AuthService;
  passwords: PasswordService;
  cookieName: string;
  client?: PrismaClient;
}

const agendaQuery = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    status: z
      .enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW'])
      .optional(),
  })
  .strict();
const appointmentParams = z.object({ publicId: z.uuid() }).strict();
const commissionHistoryQuery = z
  .object({
    /** Dias civis inclusivos no fuso do tenant, como no Financeiro. */
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
  })
  .strict()
  .refine(
    (query) =>
      query.fromDate === undefined || query.toDate === undefined || query.fromDate <= query.toDate,
    { message: 'O início do período deve ser anterior ao fim.', path: ['toDate'] },
  );
const unavailabilityItemParams = z.object({ itemPublicId: z.uuid() }).strict();
const availabilityQuery = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    servicePublicId: z.uuid().optional(),
    unitPublicId: z.uuid().optional(),
  })
  .strict();
const actor = (r: { auth: { user: { id: bigint }; session: { id: bigint } } }) => ({
  userId: r.auth.user.id,
  sessionId: r.auth.session.id,
});

export const professionalSelfRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  await app.register(tenantContextPlugin, {
    authService: options.authService,
    cookieName: options.cookieName,
    client: options.client,
  });

  app.get(
    '/tenant/professionals/me',
    { schema: { response: { 200: ProfessionalPublicSchema } } },
    (r) => {
      return options.professionals.me(r.tenant.id, r.auth.user.id);
    },
  );

  app.patch(
    '/tenant/professionals/me/profile',
    { schema: { body: UpdateMyProfessionalProfileRequestSchema, response: { 200: ProfessionalPublicSchema } } },
    (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.update');
      return options.professionals.updateMyProfile(r.tenant.id, r.auth.user.id, r.body, actor(r));
    },
  );

  app.put(
    '/tenant/professionals/me/password',
    {
      schema: {
        body: z.object({
          password: z.string().min(8),
          passwordConfirmation: z.string().min(8),
        }).refine(d => d.password === d.passwordConfirmation, {
          message: 'Senhas não conferem.',
          path: ['passwordConfirmation'],
        }).strict(),
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.update');
      await options.professionals.changePassword(
        r.tenant.id,
        r.auth.user.id,
        r.body.password,
        options.passwords,
        actor(r),
      );
      return { success: true };
    },
  );

  app.get(
    '/tenant/professionals/me/agenda',
    { schema: { querystring: agendaQuery, response: { 200: AppointmentListResponseSchema } } },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.appointments.list(r.tenant.id, {
        from: r.query.from,
        to: r.query.to,
        status: r.query.status,
        professionalPublicId: me.publicId,
      });
    },
  );

  app.get(
    '/tenant/professionals/me/appointments/:publicId',
    { schema: { params: appointmentParams, response: { 200: AppointmentPublicSchema } } },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const professionalId = await options.professionals.myId(r.tenant.id, r.auth.user.id);
      return options.appointments.getForProfessional(
        r.tenant.id,
        professionalId,
        r.params.publicId,
      );
    },
  );

  app.get(
    '/tenant/professionals/me/appointments/:publicId/history',
    { schema: { params: appointmentParams, response: { 200: AppointmentHistoryResponseSchema } } },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const professionalId = await options.professionals.myId(r.tenant.id, r.auth.user.id);
      return options.appointments.historyForProfessional(
        r.tenant.id,
        professionalId,
        r.params.publicId,
      );
    },
  );

  app.patch(
    '/tenant/professionals/me/appointments/:publicId/notes',
    {
      schema: {
        params: appointmentParams,
        body: ProfessionalAppointmentNotesRequestSchema,
        response: { 200: AppointmentPublicSchema },
      },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.update');
      const professionalId = await options.professionals.myId(r.tenant.id, r.auth.user.id);
      return options.appointments.notesForProfessional(
        r.tenant.id,
        professionalId,
        r.params.publicId,
        r.body.notes,
        actor(r),
      );
    },
  );

  for (const status of ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELED'] as const)
    app.post(
      `/tenant/professionals/me/appointments/:publicId/${status.toLowerCase()}`,
      {
        schema: {
          params: appointmentParams,
          body: AppointmentStatusRequestSchema,
          response: { 200: AppointmentStatusResponseSchema },
        },
      },
      async (r) => {
        options.authService.requirePermission(r.tenant, 'professional.self.update');
        const professionalId = await options.professionals.myId(r.tenant.id, r.auth.user.id);
        return options.appointments.statusForProfessional(
          r.tenant.id,
          professionalId,
          r.params.publicId,
          status,
          r.body.reason,
          actor(r),
        );
      },
    );

  if (options.payments !== undefined) {
    const payments = options.payments;
    app.get(
      '/tenant/professionals/me/appointments/:publicId/payments',
      { schema: { params: appointmentParams, response: { 200: AppointmentPaymentsResponseSchema } } },
      async (r) => {
        options.authService.requirePermission(r.tenant, 'professional.self.read');
        const professionalId = await options.professionals.myId(r.tenant.id, r.auth.user.id);
        await options.appointments.getForProfessional(r.tenant.id, professionalId, r.params.publicId);
        return payments.listForAppointment(r.tenant.id, r.params.publicId);
      },
    );
    app.post(
      '/tenant/professionals/me/appointments/:publicId/payments',
      { schema: { params: appointmentParams, body: CreatePaymentRequestSchema, response: { 201: PaymentPublicSchema } } },
      async (r, reply) => {
        options.authService.requirePermission(r.tenant, 'professional.self.update');
        const professionalId = await options.professionals.myId(r.tenant.id, r.auth.user.id);
        await options.appointments.getForProfessional(r.tenant.id, professionalId, r.params.publicId);
        return reply.status(201).send(await payments.create(r.tenant.id, r.params.publicId, r.body, actor(r)));
      },
    );
  }

  app.get(
    '/tenant/professionals/me/schedule',
    { schema: { response: { 200: ProfessionalScheduleResponseSchema } } },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.schedules.list(r.tenant.id, me.publicId);
    },
  );

  app.get(
    '/tenant/professionals/me/services',
    { schema: { response: { 200: ProfessionalServicesResponseSchema } } },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.professionalServices.listProfessional(r.tenant.id, me.publicId);
    },
  );

  app.get(
    '/tenant/professionals/me/commissions',
    { schema: { response: { 200: ProfessionalCommissionResponseSchema } } },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.professionalServices.commissions(r.tenant.id, me.publicId, {
        type: me.commissionType,
        value: me.commissionValue,
      });
    },
  );

  if (options.commissions !== undefined) {
    const commissions = options.commissions;
    app.get(
      '/tenant/professionals/me/commissions/history',
      { schema: { querystring: commissionHistoryQuery, response: { 200: CommissionListResponseSchema } } },
      async (r) => {
        options.authService.requirePermission(r.tenant, 'professional.self.read');
        const professionalId = await options.professionals.myId(r.tenant.id, r.auth.user.id);
        const timezone = resolveTimezone(r.tenant.timezone);
        return commissions.listForProfessional(r.tenant.id, professionalId, {
          ...(r.query.fromDate === undefined
            ? {}
            : { from: zonedDayStart(r.query.fromDate, timezone).toISOString() }),
          ...(r.query.toDate === undefined
            ? {}
            : {
                to: zonedDayStart(addDaysToDay(r.query.toDate, 1), timezone).toISOString(),
              }),
        });
      },
    );
  }

  app.get(
    '/tenant/professionals/me/availability',
    { schema: { querystring: availabilityQuery, response: { 200: CalendarResponseSchema } } },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      await options.availability.auditRead(r.tenant.id, actor(r), 'calendar.read');
      return options.availability.calendar(r.tenant.id, {
        from: r.query.from,
        to: r.query.to,
        professionalPublicId: me.publicId,
        servicePublicId: r.query.servicePublicId,
        unitPublicId: r.query.unitPublicId,
      });
    },
  );

  app.get(
    '/tenant/professionals/me/unavailabilities',
    {
      schema: {
        querystring: ProfessionalUnavailabilityListQuerySchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.read');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.unavailabilities.list(r.tenant.id, me.publicId, r.query);
    },
  );

  app.post(
    '/tenant/professionals/me/unavailabilities',
    {
      schema: {
        body: UpdateProfessionalUnavailabilityRequestSchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.update');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.unavailabilities.create(r.tenant.id, me.publicId, r.body, actor(r));
    },
  );

  app.patch(
    '/tenant/professionals/me/unavailabilities/:itemPublicId',
    {
      schema: {
        params: unavailabilityItemParams,
        body: UpdateProfessionalUnavailabilityRequestSchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.update');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.unavailabilities.update(
        r.tenant.id,
        me.publicId,
        r.params.itemPublicId,
        r.body,
        actor(r),
      );
    },
  );

  app.patch(
    '/tenant/professionals/me/unavailabilities/:itemPublicId/status',
    {
      schema: {
        params: unavailabilityItemParams,
        body: SetProfessionalUnavailabilityStatusRequestSchema,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.update');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.unavailabilities.setStatus(
        r.tenant.id,
        me.publicId,
        r.params.itemPublicId,
        r.body.active,
        actor(r),
      );
    },
  );

  app.delete(
    '/tenant/professionals/me/unavailabilities/:itemPublicId',
    {
      schema: {
        params: unavailabilityItemParams,
        response: { 200: ProfessionalUnavailabilityListResponseSchema },
      },
    },
    async (r) => {
      options.authService.requirePermission(r.tenant, 'professional.self.update');
      const me = await options.professionals.me(r.tenant.id, r.auth.user.id);
      return options.unavailabilities.remove(
        r.tenant.id,
        me.publicId,
        r.params.itemPublicId,
        actor(r),
      );
    },
  );
};
