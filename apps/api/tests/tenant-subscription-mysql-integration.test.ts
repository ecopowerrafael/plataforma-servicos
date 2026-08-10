import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { TenantSubscriptionService } from '../src/modules/tenants/tenant-subscription.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'visualização do plano e assinatura pelo estabelecimento',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const service = new TenantSubscriptionService(client);
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let noSubscriptionTenantId: bigint;
    let planId: bigint;
    const now = new Date();
    const periodStart = new Date(now.getTime() - 5 * 86_400_000);
    const periodEnd = new Date(now.getTime() + 25 * 86_400_000);

    beforeEach(async () => {
      const plan = await client.commercialPlan.create({
        data: {
          publicId: randomUUID(),
          code: `PLAN_${suffix.toUpperCase()}`,
          name: 'Plano Profissional',
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          priceCents: 19_900n,
          currency: 'BRL',
          trialDays: 7,
          limits: {
            create: [
              { key: 'units.max', valueType: 'INTEGER', integerValue: 3n },
              { key: 'members.max', valueType: 'INTEGER', integerValue: 10n },
              { key: 'professionals.max', valueType: 'INTEGER', integerValue: 5n },
              { key: 'monthly_appointments.max', valueType: 'INTEGER', integerValue: null },
              { key: 'storage.megabytes', valueType: 'INTEGER', integerValue: 1024n },
              { key: 'advanced_reports.enabled', valueType: 'BOOLEAN', booleanValue: true },
            ],
          },
        },
      });
      planId = plan.id;

      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `sub-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Teste',
          displayName: 'Teste',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
      await client.tenantSubscription.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          planId,
          status: 'ACTIVE',
          effectiveKey: 'EFFECTIVE',
          startsAt: periodStart,
          currentPeriodStartsAt: periodStart,
          currentPeriodEndsAt: periodEnd,
          priceCents: 19_900n,
          currency: 'BRL',
          billingCycle: 'MONTHLY',
        },
      });

      const other = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `sub-nosub-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Sem assinatura',
          displayName: 'Sem assinatura',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      noSubscriptionTenantId = other.id;

      const [unit] = await Promise.all([
        client.businessUnit.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            name: 'Matriz',
            slug: 'matriz',
            status: 'ACTIVE',
            timezone: 'America/Sao_Paulo',
          },
        }),
        client.professional.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            name: 'Profissional 1',
            publicName: 'Profissional 1',
            calendarColor: '#111111',
            active: true,
          },
        }),
        client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Cliente 1' } }),
      ]);
      const service1 = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Consulta',
          durationMinutes: 30,
          hasPostServiceBreak: false,
          priceCents: 10_000n,
          color: '#222222',
        },
      });
      const professional = await client.professional.findFirstOrThrow({ where: { tenantId } });
      const customer = await client.customer.findFirstOrThrow({ where: { tenantId } });
      await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `PROTO-${suffix}`,
          tenantId,
          unitId: unit.id,
          professionalId: professional.id,
          serviceId: service1.id,
          customerId: customer.id,
          startsAt: new Date(now.getTime() + 86_400_000),
          endsAt: new Date(now.getTime() + 86_400_000 + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
        },
      });
    });

    afterEach(async () => {
      const ids = [tenantId, noSubscriptionTenantId];
      await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
      await client.service.deleteMany({ where: { tenantId: { in: ids } } });
      await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
      await client.businessUnit.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenantSubscription.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
      await client.planLimit.deleteMany({ where: { planId } });
      await client.commercialPlan.deleteMany({ where: { id: planId } });
    });

    it('retorna plano, assinatura e limites com consumo real calculado a partir de dados existentes', async () => {
      const result = await service.get(tenantId);

      expect(result.plan.code).toBe(`PLAN_${suffix.toUpperCase()}`);
      expect(result.subscription.status).toBe('ACTIVE');
      expect(result.subscription.billingCycle).toBe('MONTHLY');
      expect(result.subscription.priceCents).toBe('19900');

      const unitsLimit = result.limits.find((limit) => limit.key === 'units.max');
      expect(unitsLimit?.usage).toBe(1);

      const professionalsLimit = result.limits.find((limit) => limit.key === 'professionals.max');
      expect(professionalsLimit?.usage).toBe(1);

      const membersLimit = result.limits.find((limit) => limit.key === 'members.max');
      expect(membersLimit?.usage).toBe(0);

      const monthlyAppointmentsLimit = result.limits.find(
        (limit) => limit.key === 'monthly_appointments.max',
      );
      expect(monthlyAppointmentsLimit?.usage).toBe(1);

    });

    it('não inventa dados de consumo para limites sem fonte real', async () => {
      const result = await service.get(tenantId);
      const meteredKeys = new Set([
        'units.max',
        'members.max',
        'professionals.max',
        'monthly_appointments.max',
      ]);
      for (const limit of result.limits) {
        if (!meteredKeys.has(limit.key)) expect(limit.usage).toBeNull();
      }
    });

    it('retorna 404 quando o estabelecimento não possui assinatura', async () => {
      await expect(service.get(noSubscriptionTenantId)).rejects.toMatchObject({
        code: 'TENANT_SUBSCRIPTION_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('isola assinaturas por tenant', async () => {
      const result = await service.get(tenantId);
      expect(result.subscription.tenantPublicId).not.toBe(
        (await client.tenant.findUniqueOrThrow({ where: { id: noSubscriptionTenantId } })).publicId,
      );
    });
  },
);
