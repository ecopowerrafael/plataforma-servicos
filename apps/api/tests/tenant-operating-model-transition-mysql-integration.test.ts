import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/tenants/plan-entitlement.service.js', () => ({
  PlanEntitlementService: class {
    async assertCanCreateAppointment(): Promise<void> {}
  },
}));

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerMembershipRepository } from '../src/modules/customers/customer-membership.repository.js';
import { CustomerMembershipService } from '../src/modules/customers/customer-membership.service.js';
import { TenantOperatingModelTransitionService } from '../src/modules/tenants/tenant-operating-model-transition.service.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { CustomerMembershipUsageService } from '../src/modules/customers/customer-membership-usage.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error('TEST_DATABASE_URL is required for operating-model concurrency tests.');

describe('operating model transition concurrency (MySQL)', () => {
  const clients = [createPrismaClient(databaseUrl), createPrismaClient(databaseUrl)];
  const ids = { tenant: 0n, plan: 0n, customer: 0n, professional: 0n, service: 0n, user: 0n, session: 0n };
  let customerPublicId = '';
  let planPublicId = '';
  let tenantPublicId = '';
  let professionalPublicId = '';
  let servicePublicId = '';

  beforeAll(async () => {
    const [client] = clients;
    const [{ database_name: database }] = await client.$queryRaw<Array<{ database_name: string }>>`SELECT DATABASE() AS database_name`;
    const expectedDatabase = process.env.TEST_DATABASE_NAME ?? 'u891593158_teste';
    if (database !== expectedDatabase) throw new Error(`Wrong integration database: ${database}`);

    const user = await client.user.create({ data: { publicId: randomUUID(), email: `transition-${randomUUID()}@test.invalid`, normalizedEmail: `transition-${randomUUID()}@test.invalid`, passwordHash: 'test', status: 'ACTIVE' } });
    const session = await client.userSession.create({ data: { publicId: randomUUID(), userId: user.id, tokenHash: randomUUID().replaceAll('-', ''), expiresAt: new Date(Date.now() + 86_400_000), lastSeenAt: new Date() } });
    ids.user = user.id;
    ids.session = session.id;
    tenantPublicId = randomUUID();
    customerPublicId = randomUUID();
    planPublicId = randomUUID();
    const tenant = await client.tenant.create({
      data: { publicId: tenantPublicId, slug: `concurrency-${randomUUID().slice(0, 8)}`, legalName: 'Concurrency Test', displayName: 'Concurrency Test', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL', operatingModel: 'MEMBERSHIP' },
    });
    ids.tenant = tenant.id;
    await client.tenantSettings.create({ data: { tenantId: ids.tenant } });
    const plan = await client.customerMembershipPlan.create({ data: { publicId: planPublicId, tenantId: ids.tenant, name: 'Concurrency Plan', priceCents: 0n, billingInterval: 'MONTHLY' } });
    ids.plan = plan.id;
    const customer = await client.customer.create({ data: { publicId: customerPublicId, tenantId: ids.tenant, name: 'Concurrency Customer' } });
    ids.customer = customer.id;
    professionalPublicId = randomUUID();
    servicePublicId = randomUUID();
    const professional = await client.professional.create({ data: { publicId: professionalPublicId, tenantId: ids.tenant, name: 'Concurrency Professional', publicName: 'Concurrency Professional', calendarColor: '#111111' } });
    ids.professional = professional.id;
    const service = await client.service.create({ data: { publicId: servicePublicId, tenantId: ids.tenant, name: 'Concurrency Service', durationMinutes: 30, priceCents: 10000n, color: '#111111' } });
    ids.service = service.id;
    await client.professionalService.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, professionalId: ids.professional, serviceId: ids.service, priceCents: 10000n, durationMinutes: 30 } });
  }, 60_000);

  afterAll(async () => {
    const [client] = clients;
    if (ids.tenant !== 0n) {
      await client.auditLog.deleteMany({ where: { tenantId: ids.tenant } });
      await client.tenantOperatingModelTransition.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customerMembershipUsage.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customerMembershipCharge.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customerMembership.deleteMany({ where: { tenantId: ids.tenant } });
      await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: ids.tenant } });
      await client.appointment.deleteMany({ where: { tenantId: ids.tenant } });
      await client.professionalService.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customerMembershipPlanBenefit.deleteMany({ where: { serviceId: ids.service } });
      await client.service.deleteMany({ where: { id: ids.service } });
      await client.professional.deleteMany({ where: { id: ids.professional } });
      await client.customerMembershipPlan.deleteMany({ where: { tenantId: ids.tenant } });
      await client.customer.deleteMany({ where: { id: ids.customer } });
      await client.tenantSettings.deleteMany({ where: { tenantId: ids.tenant } });
      await client.tenant.delete({ where: { id: ids.tenant } });
      await client.userSession.delete({ where: { id: ids.session } });
      await client.user.delete({ where: { id: ids.user } });
    }
    await Promise.all(clients.map((client) => client.$disconnect()));
  }, 60_000);

  it('keeps membership creation and transition deterministic across independent clients', async () => {
    const membership = new CustomerMembershipService(new CustomerMembershipRepository(clients[0]));
    const transition = new TenantOperatingModelTransitionService(clients[1]);
    const actor = { userId: ids.user, sessionId: ids.session };

    for (let iteration = 0; iteration < 10; iteration += 1) {
      await clients[0].tenant.update({ where: { id: ids.tenant }, data: { operatingModel: 'MEMBERSHIP' } });
      await clients[0].customerMembership.deleteMany({ where: { tenantId: ids.tenant } });
      const results = await Promise.allSettled([
        membership.create(ids.tenant, customerPublicId, planPublicId, actor),
        transition.transition(ids.tenant, 'SERVICE_PRICING', 'MEMBERSHIP', actor),
      ]);
      const finalTenant = await clients[0].tenant.findUniqueOrThrow({ where: { id: ids.tenant }, select: { operatingModel: true } });
      const openMemberships = await clients[0].customerMembership.count({ where: { tenantId: ids.tenant, status: { in: ['ACTIVE', 'PENDING', 'PAST_DUE', 'PAUSED'] } } });
      expect(finalTenant.operatingModel === 'SERVICE_PRICING' ? openMemberships : 0).toBe(0);
      const transitionResult = results.find((result) => result.status === 'fulfilled' && result.value && typeof result.value === 'object' && 'to' in result.value);
      if (transitionResult !== undefined) expect(finalTenant.operatingModel).toBe('SERVICE_PRICING');
      else expect(finalTenant.operatingModel).toBe('MEMBERSHIP');
    }
  }, 60_000);

  it('keeps appointment creation and transition deterministic across independent clients', async () => {
    const actor = { userId: ids.user, sessionId: ids.session };
    const appointmentServices = clients.map((client) => {
      const service = new AppointmentService(new AppointmentRepository(client), new AvailabilityService(new AvailabilityRepository(client)), client);
      (service as unknown as { assertCommercialCapability: () => Promise<void> }).assertCommercialCapability = async () => {};
      (service as unknown as { availability: { assertSlot: () => Promise<void> } }).availability.assertSlot = async () => {};
      service.setMembershipUsageService(new CustomerMembershipUsageService(client));
      return service;
    });
    for (let iteration = 0; iteration < 10; iteration += 1) {
      await clients[0].tenant.update({ where: { id: ids.tenant }, data: { operatingModel: 'MEMBERSHIP' } });
      await clients[0].customerMembershipUsage.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].appointmentHistoryEntry.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].appointment.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].customerMembershipCharge.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].customerMembership.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].customerMembershipPlanBenefit.deleteMany({ where: { planId: ids.plan } });
      await clients[0].customerMembershipPlanBenefit.create({ data: { publicId: randomUUID(), planId: ids.plan, serviceId: ids.service, type: 'UNLIMITED' } });
      const membership = await clients[0].customerMembership.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, customerId: ids.customer, planId: ids.plan, status: 'ACTIVE', activeKey: `${ids.tenant}:concurrency`, startedAt: new Date(), currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 30 * 86_400_000);
      await clients[0].customerMembershipCharge.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, membershipId: membership.id, periodStart, periodEnd, amountCents: 0n, status: 'PAID', paidAt: periodStart, dueAt: periodStart, planSnapshot: { benefits: [{ serviceId: ids.service.toString(), type: 'UNLIMITED' }] } } });
      const input = { customerPublicId, professionalPublicId, servicePublicId, startsAt: new Date(Date.now() + (iteration + 2) * 86_400_000).toISOString(), source: 'INTERNAL' };
      const transition = new TenantOperatingModelTransitionService(clients[1]);
      const results = await Promise.allSettled([
        appointmentServices[0].create(ids.tenant, input, actor),
        transition.transition(ids.tenant, 'SERVICE_PRICING', 'MEMBERSHIP', actor),
      ]);
      const finalTenant = await clients[0].tenant.findUniqueOrThrow({ where: { id: ids.tenant }, select: { operatingModel: true } });
      const appointments = await clients[0].appointment.count({ where: { tenantId: ids.tenant } });
      expect(appointments).toBeLessThanOrEqual(1);
      const transitionResult = results.find((result) => result.status === 'fulfilled' && result.value && typeof result.value === 'object' && 'to' in result.value);
      if (transitionResult !== undefined) expect(finalTenant.operatingModel).toBe('MEMBERSHIP');
      else expect(finalTenant.operatingModel).toBe('MEMBERSHIP');
      if (finalTenant.operatingModel === 'MEMBERSHIP') {
        expect(appointments).toBe(1);
        expect((await clients[0].appointment.findFirstOrThrow({ where: { tenantId: ids.tenant }, select: { chargeSource: true } })).chargeSource).toMatch(/MEMBERSHIP/);
      }
    }
  }, 60_000);

  it('re-reads SERVICE_PRICING before appointment creation after transition wins', async () => {
    const actor = { userId: ids.user, sessionId: ids.session };
    const service = new AppointmentService(new AppointmentRepository(clients[0]), new AvailabilityService(new AvailabilityRepository(clients[0])), clients[0]);
    (service as unknown as { assertCommercialCapability: () => Promise<void> }).assertCommercialCapability = async () => {};
    (service as unknown as { availability: { assertSlot: () => Promise<void> } }).availability.assertSlot = async () => {};
    for (let iteration = 0; iteration < 10; iteration += 1) {
      await clients[0].customerMembershipUsage.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].appointmentHistoryEntry.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].appointment.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].customerMembershipCharge.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].customerMembership.deleteMany({ where: { tenantId: ids.tenant } });
      await clients[0].customerMembershipPlanBenefit.deleteMany({ where: { planId: ids.plan } });
      await clients[0].tenant.update({ where: { id: ids.tenant }, data: { operatingModel: 'MEMBERSHIP' } });
      const transition = new TenantOperatingModelTransitionService(clients[1]);
      const transitionPromise = transition.transition(ids.tenant, 'SERVICE_PRICING', 'MEMBERSHIP', actor);
      const appointmentPromise = service.create(ids.tenant, { customerPublicId, professionalPublicId, servicePublicId, startsAt: new Date(Date.now() + (iteration + 2) * 86_400_000).toISOString(), source: 'INTERNAL' }, actor);
      const [transitionResult, appointment] = await Promise.all([transitionPromise, appointmentPromise]);
      expect(transitionResult.to).toBe('SERVICE_PRICING');
      expect(appointment.chargeSource).toBe('SERVICE_PRICE');
      expect((await clients[0].tenant.findUniqueOrThrow({ where: { id: ids.tenant }, select: { operatingModel: true } })).operatingModel).toBe('SERVICE_PRICING');
    }
  }, 60_000);
});
