import { randomBytes, randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { type Environment } from '../src/config/environment.js';
import { createDatabaseConnection, createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { CapturingAccountMessageDelivery } from '../src/modules/auth/message-delivery.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { type PlatformAuthContext, PlatformService } from '../src/modules/platform/platform.service.js';
import { TenantCommercialPolicyService } from '../src/modules/platform/tenant-commercial-policy.service.js';
import { TenantCommercialStatusResolver } from '../src/modules/platform/tenant-commercial-status.resolver.js';
import { TenantCommercialSweepService } from '../src/modules/platform/tenant-commercial-sweep.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

function secret(): string {
  return `Teste-${randomBytes(18).toString('base64url')}9`;
}

function authCookie(response: {
  headers: Record<string, number | string | string[] | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  if (typeof header !== 'string') throw new Error('Cookie de sessão ausente.');
  const cookie = header.split(';', 1)[0];
  if (cookie === undefined) throw new Error('Cookie de sessão inválido.');
  return cookie;
}

describe.skipIf(url === undefined)(
  'política comercial de tenants: trial, carência e suspensão',
  () => {
    const dbUrl = url ?? 'mysql://invalid';
    const client = createPrismaClient(dbUrl);
    const connection = createDatabaseConnection(dbUrl);
    const delivery = new CapturingAccountMessageDelivery();
    const environment: Environment = {
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: 3101,
      DATABASE_URL: dbUrl,
      CORS_ORIGINS: ['http://127.0.0.1:5174'],
      LOG_LEVEL: 'silent',
      APP_WEB_URL: 'http://127.0.0.1:5174',
      AUTH_COOKIE_NAME: 'ps_session',
      AUTH_SESSION_TTL_HOURS: 24,
      AUTH_MAX_ACTIVE_SESSIONS: 3,
      AUTH_COOKIE_SECURE: false,
      PASSWORD_ARGON2_MEMORY_COST: 19_456,
      PASSWORD_ARGON2_TIME_COST: 2,
      PASSWORD_ARGON2_PARALLELISM: 1,
      LOGIN_RATE_LIMIT_MAX: 100,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: 1,
      PASSWORD_RESET_TTL_MINUTES: 30,
      INVITATION_TTL_HOURS: 24,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    };

    let app: Awaited<ReturnType<typeof buildApp>>;
    const platformService = new PlatformService(client);
    const policyService = new TenantCommercialPolicyService(client);
    const sweepService = new TenantCommercialSweepService(client);
    const resolver = new TenantCommercialStatusResolver();
    const appointments = new AppointmentService(
      new AppointmentRepository(client),
      new AvailabilityService(new AvailabilityRepository(client)),
      policyService,
      client,
    );
    const metadata = { ipAddress: null, userAgent: null };

    let originalPolicy: Awaited<ReturnType<typeof policyService.getOrCreateRaw>>;
    let actorUserId: bigint;
    let actor: PlatformAuthContext;

    const createdTenantIds: bigint[] = [];
    const createdPlanIds: bigint[] = [];

    async function createPlan(trialDays: number | null, suffix: string) {
      const plan = await client.commercialPlan.create({
        data: {
          publicId: randomUUID(),
          code: `POL_${suffix.toUpperCase()}_${randomUUID().slice(0, 6).toUpperCase()}`,
          name: 'Plano Política',
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          priceCents: 9900n,
          currency: 'BRL',
          trialDays,
        },
      });
      createdPlanIds.push(plan.id);
      return plan;
    }

    async function createTenant(suffix: string) {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `pol-${suffix}-${randomUUID().slice(0, 6)}`,
          legalName: 'Teste Política',
          displayName: 'Teste Política',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      createdTenantIds.push(tenant.id);
      return tenant;
    }

    async function resetPolicyBaseline(): Promise<void> {
      await client.tenantCommercialPolicy.update({
        where: { id: originalPolicy.id },
        data: {
          defaultTrialDays: 7,
          graceDays: 7,
          autoSuspendAfterGrace: true,
          allowAdminLoginWhileBlocked: true,
          allowCalendarReadWhileBlocked: true,
          allowAdminChangesWhileBlocked: false,
          allowInternalBookingWhileBlocked: false,
          allowPublicBookingWhileBlocked: false,
          publicSiteBehaviorWhileBlocked: 'HIDE_BOOKING',
          adminMessage:
            'Sua assinatura está pendente. Regularize o pagamento para continuar utilizando todos os recursos do sistema. Seus dados permanecem preservados.',
          publicMessage:
            'Os agendamentos online deste estabelecimento estão temporariamente indisponíveis. Entre em contato diretamente com o estabelecimento para mais informações.',
        },
      });
    }

    beforeAll(async () => {
      app = await buildApp({ environment, database: connection, messageDelivery: delivery });
      originalPolicy = await policyService.getOrCreateRaw();
      const actorUser = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `policy-actor-${randomUUID()}@test.invalid`,
          normalizedEmail: `policy-actor-${randomUUID()}@test.invalid`,
          passwordHash: 'test',
          status: 'ACTIVE',
        },
      });
      actorUserId = actorUser.id;
      actor = {
        administrator: { id: 1n, publicId: randomUUID(), status: 'ACTIVE' },
        user: { id: actorUserId, publicId: actorUser.publicId, email: actorUser.email, status: 'ACTIVE' },
        permissions: [],
      };
      await resetPolicyBaseline();
    });

    afterEach(async () => {
      const tenantIds = createdTenantIds.splice(0);
      const planIds = createdPlanIds.splice(0);
      if (tenantIds.length > 0) {
        await client.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.subscriptionHistory.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.appointment.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.customer.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.professional.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.service.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.businessUnit.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.tenantSettings.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await client.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      if (planIds.length > 0) {
        await client.planLimit.deleteMany({ where: { planId: { in: planIds } } });
        await client.commercialPlan.deleteMany({ where: { id: { in: planIds } } });
      }
      await resetPolicyBaseline();
    });

    afterAll(async () => {
      await client.tenantCommercialPolicy.update({
        where: { id: originalPolicy.id },
        data: {
          defaultTrialDays: originalPolicy.defaultTrialDays,
          graceDays: originalPolicy.graceDays,
          autoSuspendAfterGrace: originalPolicy.autoSuspendAfterGrace,
          allowAdminLoginWhileBlocked: originalPolicy.allowAdminLoginWhileBlocked,
          allowCalendarReadWhileBlocked: originalPolicy.allowCalendarReadWhileBlocked,
          allowAdminChangesWhileBlocked: originalPolicy.allowAdminChangesWhileBlocked,
          allowInternalBookingWhileBlocked: originalPolicy.allowInternalBookingWhileBlocked,
          allowPublicBookingWhileBlocked: originalPolicy.allowPublicBookingWhileBlocked,
          publicSiteBehaviorWhileBlocked: originalPolicy.publicSiteBehaviorWhileBlocked,
          adminMessage: originalPolicy.adminMessage,
          publicMessage: originalPolicy.publicMessage,
        },
      });
      await client.auditLog.deleteMany({ where: { userId: actorUserId } });
      await client.user.delete({ where: { id: actorUserId } });
      await app.close();
      await client.$disconnect();
    });

    it('aplica o trial padrão de 7 dias quando o plano não define trialDays e não há override', async () => {
      const plan = await createPlan(null, 't1');
      const tenant = await createTenant('t1');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'trial padrao de 7 dias' },
        actor,
        metadata,
      );
      expect(subscription.status).toBe('TRIALING');
      expect(subscription.trialEndsAt).not.toBeNull();
      const diffDays = Math.round(
        (new Date(subscription.trialEndsAt ?? '').getTime() -
          new Date(subscription.startsAt).getTime()) /
          86_400_000,
      );
      expect(diffDays).toBe(7);
    });

    it('usa o trialDays customizado do plano (14 dias) em vez do padrão global', async () => {
      const plan = await createPlan(14, 't2');
      const tenant = await createTenant('t2');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'trial customizado de 14 dias' },
        actor,
        metadata,
      );
      expect(subscription.status).toBe('TRIALING');
      const diffDays = Math.round(
        (new Date(subscription.trialEndsAt ?? '').getTime() -
          new Date(subscription.startsAt).getTime()) /
          86_400_000,
      );
      expect(diffDays).toBe(14);
      expect(diffDays).not.toBe(7);
    });

    it('cria assinatura já ativa e sem campos de trial quando o plano define trialDays igual a zero', async () => {
      const plan = await createPlan(0, 't3');
      const tenant = await createTenant('t3');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'sem periodo de trial' },
        actor,
        metadata,
      );
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.trialEndsAt).toBeNull();
      const row = await client.tenantSubscription.findUniqueOrThrow({
        where: { publicId: subscription.publicId },
      });
      expect(row.trialStartedAt).toBeNull();
    });

    it('a varredura transita um trial expirado para PAST_DUE definindo graceEndsAt conforme a política', async () => {
      const plan = await createPlan(7, 't4');
      const tenant = await createTenant('t4');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'trial vai expirar' },
        actor,
        metadata,
      );
      await client.tenantSubscription.update({
        where: { publicId: subscription.publicId },
        data: { trialEndsAt: new Date(subscription.startsAt) },
      });
      const result = await sweepService.run();
      expect(result.pastDued).toBeGreaterThanOrEqual(1);
      const updated = await client.tenantSubscription.findUniqueOrThrow({
        where: { publicId: subscription.publicId },
      });
      expect(updated.status).toBe('PAST_DUE');
      if (updated.graceEndsAt === null) throw new Error('graceEndsAt não deveria ser nulo.');
      const graceDays = Math.round((updated.graceEndsAt.getTime() - Date.now()) / 86_400_000);
      expect(graceDays).toBeGreaterThanOrEqual(6);
      expect(graceDays).toBeLessThanOrEqual(7);
    });

    it('resolve o estado de carência (GRACE) enquanto graceEndsAt está no futuro, com capacidades da política', async () => {
      const policy = await policyService.getOrCreateRaw();
      const status = resolver.resolve(
        {
          status: 'PAST_DUE',
          trialEndsAt: null,
          currentPeriodEndsAt: null,
          graceEndsAt: new Date(Date.now() + 3 * 86_400_000),
        },
        policy,
      );
      expect(status.state).toBe('GRACE');
      expect(status.capabilities.canAcceptPublicBooking).toBe(policy.allowPublicBookingWhileBlocked);
      expect(status.capabilities.canAccessAdmin).toBe(policy.allowAdminLoginWhileBlocked);
      expect(status.capabilities.canManageData).toBe(policy.allowAdminChangesWhileBlocked);
    });

    it('suspende assinatura PAST_DUE após o fim da carência quando autoSuspendAfterGrace está ativo', async () => {
      const plan = await createPlan(7, 't6');
      const tenant = await createTenant('t6');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'grace vai expirar' },
        actor,
        metadata,
      );
      await client.tenantSubscription.update({
        where: { publicId: subscription.publicId },
        data: { status: 'PAST_DUE', graceEndsAt: new Date(Date.now() - 60_000) },
      });
      const result = await sweepService.run();
      expect(result.suspended).toBeGreaterThanOrEqual(1);
      const updated = await client.tenantSubscription.findUniqueOrThrow({
        where: { publicId: subscription.publicId },
      });
      expect(updated.status).toBe('SUSPENDED');
    });

    it('rejeita agendamento público quando suspenso e a política nega reservas públicas', async () => {
      await client.tenantCommercialPolicy.update({
        where: { id: originalPolicy.id },
        data: { allowPublicBookingWhileBlocked: false },
      });
      const plan = await createPlan(7, 't7');
      const tenant = await createTenant('t7');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'bloqueio de reserva publica' },
        actor,
        metadata,
      );
      await client.tenantSubscription.update({
        where: { publicId: subscription.publicId },
        data: { status: 'SUSPENDED' },
      });

      await expect(
        appointments.create(
          tenant.id,
          {
            customerPublicId: randomUUID(),
            professionalPublicId: randomUUID(),
            servicePublicId: randomUUID(),
            startsAt: new Date(Date.now() + 86_400_000).toISOString(),
            source: 'PUBLIC_BOOKING',
          },
          { userId: null, sessionId: null },
        ),
      ).rejects.toMatchObject({ code: 'PUBLIC_BOOKING_UNAVAILABLE' });
    });

    it('bloqueia rota administrativa quando suspenso e a política nega login administrativo, e libera quando a política permite', async () => {
      const run = randomUUID().slice(0, 8);
      const email = `pol-admin-${run}@test.invalid`;
      const password = secret();

      const provisioned = await app.inject({
        method: 'POST',
        url: '/internal/tenants',
        payload: {
          legalName: `Política Admin ${run}`,
          displayName: `Política Admin ${run}`,
          slug: `pol-admin-${run}`,
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
          initialUnit: { name: 'Matriz', slug: 'matriz', countryCode: 'BR' },
          owner: { email, password },
        },
      });
      expect(provisioned.statusCode, provisioned.body).toBe(201);
      const { tenant } = provisioned.json<{ tenant: { publicId: string } }>();
      const tenantRow = await client.tenant.findUniqueOrThrow({
        where: { publicId: tenant.publicId },
      });

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      });
      expect(login.statusCode, login.body).toBe(200);
      const cookie = authCookie(login);

      const plan = await createPlan(7, 't8');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'gating de rota admin' },
        actor,
        metadata,
      );
      await client.tenantSubscription.update({
        where: { publicId: subscription.publicId },
        data: { status: 'SUSPENDED' },
      });

      try {
        await client.tenantCommercialPolicy.update({
          where: { id: originalPolicy.id },
          data: { allowAdminLoginWhileBlocked: false },
        });
        const blocked = await app.inject({
          method: 'GET',
          url: '/tenant/customers',
          headers: { cookie, 'x-tenant-id': tenant.publicId },
        });
        expect(blocked.statusCode).toBe(403);

        await client.tenantCommercialPolicy.update({
          where: { id: originalPolicy.id },
          data: { allowAdminLoginWhileBlocked: true },
        });
        const allowed = await app.inject({
          method: 'GET',
          url: '/tenant/customers',
          headers: { cookie, 'x-tenant-id': tenant.publicId },
        });
        expect(allowed.statusCode).toBe(200);
      } finally {
        const ownerUser = await client.user.findUnique({
          where: { normalizedEmail: email.toLowerCase() },
        });
        await client.auditLog.deleteMany({ where: { tenantId: tenantRow.id } });
        if (ownerUser !== null) {
          await client.auditLog.deleteMany({ where: { userId: ownerUser.id } });
        }
        await client.subscriptionHistory.deleteMany({ where: { tenantId: tenantRow.id } });
        await client.tenantSubscription.deleteMany({ where: { tenantId: tenantRow.id } });
        await client.userSession.deleteMany({
          where: { user: { normalizedEmail: email.toLowerCase() } },
        });
        await client.tenantMembership.deleteMany({ where: { tenantId: tenantRow.id } });
        await client.businessUnit.deleteMany({ where: { tenantId: tenantRow.id } });
        await client.tenantSettings.deleteMany({ where: { tenantId: tenantRow.id } });
        await client.tenant.delete({ where: { id: tenantRow.id } });
        await client.user.deleteMany({ where: { normalizedEmail: email.toLowerCase() } });
        await client.planLimit.deleteMany({ where: { planId: plan.id } });
        await client.commercialPlan.delete({ where: { id: plan.id } });
      }
    });

    it('preserva os dados do tenant durante o ciclo completo trial -> vencido -> suspenso', async () => {
      const plan = await createPlan(7, 't9');
      const tenant = await createTenant('t9');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'preservacao de dados' },
        actor,
        metadata,
      );
      await client.customer.createMany({
        data: [1, 2, 3].map((n) => ({
          publicId: randomUUID(),
          tenantId: tenant.id,
          name: `Cliente ${String(n)}`,
        })),
      });
      const before = await client.customer.count({ where: { tenantId: tenant.id } });
      expect(before).toBe(3);

      await client.tenantSubscription.update({
        where: { publicId: subscription.publicId },
        data: { trialEndsAt: new Date(subscription.startsAt) },
      });
      await sweepService.run();
      await client.tenantSubscription.update({
        where: { publicId: subscription.publicId },
        data: { graceEndsAt: new Date(Date.now() - 60_000) },
      });
      await sweepService.run();

      const updatedSubscription = await client.tenantSubscription.findUniqueOrThrow({
        where: { publicId: subscription.publicId },
      });
      expect(updatedSubscription.status).toBe('SUSPENDED');

      const after = await client.customer.count({ where: { tenantId: tenant.id } });
      expect(after).toBe(before);
    });

    it('reativa manualmente uma assinatura suspensa, limpando graceEndsAt', async () => {
      const plan = await createPlan(7, 't10');
      const tenant = await createTenant('t10');
      const { subscription } = await platformService.createSubscription(
        tenant.publicId,
        { planPublicId: plan.publicId, trial: true, reason: 'reativacao manual' },
        actor,
        metadata,
      );
      await client.tenantSubscription.update({
        where: { publicId: subscription.publicId },
        data: { status: 'SUSPENDED', graceEndsAt: new Date() },
      });

      const { subscription: reactivated } = await platformService.transitionSubscription(
        subscription.publicId,
        'REACTIVATED',
        'reativacao manual pelo teste',
        actor,
        metadata,
      );
      expect(reactivated.status).toBe('ACTIVE');
      const row = await client.tenantSubscription.findUniqueOrThrow({
        where: { publicId: subscription.publicId },
      });
      expect(row.graceEndsAt).toBeNull();
    });

    it('isola tenants entre si: suspender o tenant A via varredura não afeta o tenant B', async () => {
      const planA = await createPlan(7, 't11a');
      const planB = await createPlan(7, 't11b');
      const tenantA = await createTenant('t11a');
      const tenantB = await createTenant('t11b');
      const { subscription: subA } = await platformService.createSubscription(
        tenantA.publicId,
        { planPublicId: planA.publicId, trial: true, reason: 'isolamento tenant a' },
        actor,
        metadata,
      );
      const { subscription: subB } = await platformService.createSubscription(
        tenantB.publicId,
        { planPublicId: planB.publicId, trial: true, reason: 'isolamento tenant b' },
        actor,
        metadata,
      );

      await client.tenantSubscription.update({
        where: { publicId: subA.publicId },
        data: { status: 'PAST_DUE', graceEndsAt: new Date(Date.now() - 60_000) },
      });

      const result = await sweepService.run();
      expect(result.suspended).toBeGreaterThanOrEqual(1);

      const rowA = await client.tenantSubscription.findUniqueOrThrow({
        where: { publicId: subA.publicId },
      });
      const rowB = await client.tenantSubscription.findUniqueOrThrow({
        where: { publicId: subB.publicId },
      });
      expect(rowA.status).toBe('SUSPENDED');
      expect(rowB.status).toBe('TRIALING');
    });

    it('garante mensagens distintas para admin e público, sem termos sensíveis na mensagem pública', async () => {
      const policy = await policyService.get();
      expect(policy.adminMessage).not.toBe(policy.publicMessage);
      expect(policy.publicMessage).not.toMatch(/inadimplente|vencid|suspens/iu);
    });
  },
);
