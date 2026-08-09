import rateLimit from '@fastify/rate-limit';
import { CommercialPlanPublicSchema, PublicCommercialPlansResponseSchema } from '@plataforma/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type PlatformService } from '../src/modules/platform/platform.service.js';
import { publicCommercialRoutes } from '../src/modules/platform/public-commercial.routes.js';
import { type TenantCommercialPolicyService } from '../src/modules/platform/tenant-commercial-policy.service.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('planos comerciais públicos', () => {
  it('expõe somente a resposta pública preparada pelo serviço e aplica o trial configurado', async () => {
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    apps.push(app);
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(rateLimit, { global: false });

    const plan = CommercialPlanPublicSchema.parse({
      publicId: '11111111-1111-4111-8111-111111111111',
      code: 'ESSENCIAL',
      name: 'Essencial',
      subtitle: 'Para quem está começando',
      shortDescription: 'Agenda, clientes e financeiro básico em um só lugar.',
      description: 'Plano público configurado.',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      priceCents: '9900',
      currency: 'BRL',
      trialDays: 7,
      isPublic: true,
      sortOrder: 1,
      highlighted: false,
      badge: null,
      ctaText: null,
      limits: [],
      benefits: [
        {
          publicId: '22222222-2222-4222-8222-222222222222',
          text: 'Agenda online',
          sortOrder: 1,
          enabled: true,
        },
      ],
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    });
    const service = Object.create(Object.prototype) as PlatformService;
    const listPublicPlans = vi.fn().mockResolvedValue([plan]);
    service.listPublicPlans = listPublicPlans;
    const commercialPolicyService = Object.create(
      Object.prototype,
    ) as TenantCommercialPolicyService;
    commercialPolicyService.get = vi.fn().mockResolvedValue({ defaultTrialDays: 7 });

    await app.register(publicCommercialRoutes, { service, commercialPolicyService });
    const response = await app.inject({ method: 'GET', url: '/public/commercial-plans' });

    expect(response.statusCode).toBe(200);
    expect(PublicCommercialPlansResponseSchema.parse(response.json())).toEqual({
      plans: [plan],
      defaultTrialDays: 7,
    });
    expect(listPublicPlans).toHaveBeenCalledWith(7);
  });
});

