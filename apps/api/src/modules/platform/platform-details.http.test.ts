import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import {
  PlatformTenantDetailResponseSchema,
  SubscriptionDetailResponseSchema,
} from '@plataforma/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { platformRoutes } from './platform.routes.js';
import { PlatformService } from './platform.service.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';
const subscriptionPublicId = '22222222-2222-4222-8222-222222222222';
const planPublicId = '33333333-3333-4333-8333-333333333333';
const createdAt = new Date('2026-08-18T12:00:00.000Z');
const apps: FastifyInstance[] = [];

const subscription = {
  id: 1n,
  publicId: subscriptionPublicId,
  status: 'ACTIVE' as const,
  startsAt: createdAt,
  trialEndsAt: null,
  currentPeriodStartsAt: createdAt,
  currentPeriodEndsAt: new Date('2026-09-18T12:00:00.000Z'),
  canceledAt: null,
  suspendedAt: null,
  endsAt: null,
  priceCents: 5_000n,
  currency: 'BRL',
  billingCycle: 'MONTHLY' as const,
  createdAt,
  updatedAt: createdAt,
  tenant: { publicId: tenantPublicId },
  plan: { publicId: planPublicId, code: 'PRO', name: 'Pro', status: 'ACTIVE' as const },
};

async function fixture() {
  const client = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
        publicId: tenantPublicId,
        slug: 'barbearia-silva',
        legalName: 'Barbearia Silva Ltda',
        displayName: 'Barbearia Silva',
        status: 'ACTIVE',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
        settings: {
          allowMultipleUnits: false,
          defaultAppointmentIntervalMinutes: 30,
          weekStartsOn: 'MONDAY',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: 'H24',
        },
        businessUnits: [],
        memberships: [],
        subscriptions: [subscription],
        subscriptionHistory: [],
        auditLogs: [],
        _count: { businessUnits: 0, memberships: 0 },
      }),
    },
    tenantSubscription: { findUnique: vi.fn().mockResolvedValue(subscription) },
    subscriptionHistory: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const service = new PlatformService(client as never);
  vi.spyOn(service, 'resolveAuth').mockResolvedValue({
    administrator: { id: 1n, publicId: tenantPublicId, status: 'ACTIVE' },
    user: { id: 2n, publicId: tenantPublicId, email: 'admin@agendei.com', status: 'ACTIVE' },
    permissions: ['platform.tenant.read', 'platform.subscription.read'],
  });
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);
  await app.register(platformRoutes, {
    service,
    authService: { authenticate: vi.fn().mockResolvedValue({}) } as never,
    cookieName: 'ps_session',
  });
  apps.push(app);
  return { app, client };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('platform detail endpoints', () => {
  it('returns a tenant detail matching the shared contract', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: `/platform/tenants/${tenantPublicId}`,
      headers: { cookie: 'ps_session=test' },
    });

    expect(response.statusCode).toBe(200);
    expect(PlatformTenantDetailResponseSchema.parse(response.json()).tenant.publicId).toBe(
      tenantPublicId,
    );
  });

  it('returns a subscription detail matching the shared contract', async () => {
    const { app, client } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: `/platform/subscriptions/${subscriptionPublicId}?page=1&limit=100`,
      headers: { cookie: 'ps_session=test' },
    });

    expect(response.statusCode).toBe(200);
    expect(SubscriptionDetailResponseSchema.parse(response.json()).subscription.publicId).toBe(
      subscriptionPublicId,
    );
    expect(client.subscriptionHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100, orderBy: { createdAt: 'desc' } }),
    );
  });
});
