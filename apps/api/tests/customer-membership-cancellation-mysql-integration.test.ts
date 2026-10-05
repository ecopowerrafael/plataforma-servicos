import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/database/connection.js';
import { CustomerMembershipRepository } from '../src/modules/customers/customer-membership.repository.js';
import { CustomerMembershipService } from '../src/modules/customers/customer-membership.service.js';
import { TenantOperatingModelTransitionService } from '../src/modules/tenants/tenant-operating-model-transition.service.js';

const url = process.env.TEST_DATABASE_URL;
if (url === undefined) throw new Error('TEST_DATABASE_URL is required for membership cancellation integration tests.');

describe('customer membership cancellation (MySQL)', () => {
  const client = createPrismaClient(url);
  const ids = { tenant: 0n, customer: 0n, plan: 0n, membership: 0n, pendingCharge: 0n, paidCharge: 0n, professional: 0n, service: 0n };
  let membershipPublicId = '';

  beforeAll(async () => {
    const [{ database_name: database }] = await client.$queryRaw<Array<{ database_name: string }>>`SELECT DATABASE() AS database_name`;
    const expectedDatabase = process.env.TEST_DATABASE_NAME ?? 'u891593158_teste';
    if (database !== expectedDatabase) throw new Error(`Wrong integration database: ${database}`);
    const tenant = await client.tenant.create({ data: { publicId: randomUUID(), slug: `cancel-${randomUUID().slice(0, 8)}`, legalName: 'Cancellation Test', displayName: 'Cancellation Test', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL', operatingModel: 'MEMBERSHIP' } });
    ids.tenant = tenant.id;
    await client.tenantSettings.create({ data: { tenantId: ids.tenant } });
    const customer = await client.customer.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, name: 'Cancellation Customer' } });
    ids.customer = customer.id;
    const plan = await client.customerMembershipPlan.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, name: 'Cancellation Plan', priceCents: 1000n, billingInterval: 'MONTHLY' } });
    ids.plan = plan.id;
    const professional = await client.professional.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, name: 'Cancellation Professional', publicName: 'Cancellation Professional', calendarColor: '#111111' } });
    ids.professional = professional.id;
    const service = await client.service.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, name: 'Cancellation Service', durationMinutes: 30, priceCents: 1000n, color: '#111111' } });
    ids.service = service.id;
  }, 60000);

  afterAll(async () => {
    if (ids.tenant === 0n) {
      await client.$disconnect();
      return;
    }
    await client.auditLog.deleteMany({ where: { tenantId: ids.tenant } });
    await client.customerMembershipUsage.deleteMany({ where: { tenantId: ids.tenant } });
    await client.customerMembershipCharge.deleteMany({ where: { tenantId: ids.tenant } });
    await client.customerMembership.deleteMany({ where: { tenantId: ids.tenant } });
    await client.customerMembershipPlan.deleteMany({ where: { tenantId: ids.tenant } });
    await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: ids.tenant } });
    await client.appointment.deleteMany({ where: { tenantId: ids.tenant } });
    await client.professionalService.deleteMany({ where: { tenantId: ids.tenant } });
    await client.service.deleteMany({ where: { id: ids.service } });
    await client.professional.deleteMany({ where: { id: ids.professional } });
    await client.customer.deleteMany({ where: { id: ids.customer } });
    await client.tenantSettings.deleteMany({ where: { tenantId: ids.tenant } });
    await client.tenant.delete({ where: { id: ids.tenant } });
    await client.$disconnect();
  }, 60000);

  it('cancels an active membership atomically and preserves paid history', async () => {
    const now = new Date();
    const membership = await client.customerMembership.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, customerId: ids.customer, planId: ids.plan, status: 'ACTIVE', activeKey: `${ids.tenant}:${ids.customer}`, startedAt: now, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 86_400_000), nextBillingAt: new Date(now.getTime() + 86_400_000) } });
    ids.membership = membership.id; membershipPublicId = membership.publicId;
    const paid = await client.customerMembershipCharge.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, membershipId: ids.membership, periodStart: now, periodEnd: new Date(now.getTime() + 86_400_000), amountCents: 1000n, status: 'PAID', paidAt: now, dueAt: now } });
    ids.paidCharge = paid.id;
    const pending = await client.customerMembershipCharge.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, membershipId: ids.membership, periodStart: new Date(now.getTime() + 86_400_000), periodEnd: new Date(now.getTime() + 2 * 86_400_000), amountCents: 1000n, status: 'PENDING', dueAt: now } });
    ids.pendingCharge = pending.id;
    const service = new CustomerMembershipService(new CustomerMembershipRepository(client));
    const actor = { userId: null, sessionId: null };
    await service.cancel(ids.tenant, membershipPublicId, actor);
    const result = await client.customerMembership.findUniqueOrThrow({ where: { id: ids.membership } });
    expect(result.status).toBe('CANCELED');
    expect(result.canceledAt).not.toBeNull();
    expect(result.nextBillingAt).toBeNull();
    expect((await client.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.paidCharge } })).status).toBe('PAID');
    expect((await client.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.pendingCharge } })).status).toBe('CANCELED');
    await service.cancel(ids.tenant, membershipPublicId, actor);
    expect(await client.auditLog.count({ where: { tenantId: ids.tenant, action: 'customer_membership.canceled' } })).toBe(1);

    for (const status of ['PENDING', 'PAST_DUE', 'PAUSED'] as const) {
      const extra = await client.customerMembership.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, customerId: ids.customer, planId: ids.plan, status, activeKey: `${ids.tenant}:${ids.customer}:${status}` } });
      await service.cancel(ids.tenant, extra.publicId, actor);
      expect((await client.customerMembership.findUniqueOrThrow({ where: { id: extra.id } })).status).toBe('CANCELED');
    }
  });

  it('blocks RESERVED usage, allows CONSUMED usage, and blocks only open membership appointments', async () => {
    const now = new Date();
    const service = new CustomerMembershipService(new CustomerMembershipRepository(client));
    const actor = { userId: null, sessionId: null };
    const createMembership = async (suffix: string) => {
      const membership = await client.customerMembership.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, customerId: ids.customer, planId: ids.plan, status: 'ACTIVE', activeKey: `${ids.tenant}:${ids.customer}:${suffix}`, startedAt: now, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 86_400_000) } });
      const charge = await client.customerMembershipCharge.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, membershipId: membership.id, periodStart: now, periodEnd: new Date(now.getTime() + 86_400_000), amountCents: 1000n, status: 'PAID', paidAt: now, dueAt: now } });
      return { membership, charge };
    };

    const reserved = await createMembership('reserved');
    await client.customerMembershipUsage.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, membershipId: reserved.membership.id, membershipChargeId: reserved.charge.id, serviceId: ids.service, quantity: 1, status: 'RESERVED' } });
    await expect(service.cancel(ids.tenant, reserved.membership.publicId, actor)).rejects.toMatchObject({ code: 'RESERVED_MEMBERSHIP_USAGE' });
    await client.customerMembershipUsage.deleteMany({ where: { membershipId: reserved.membership.id } });
    await service.cancel(ids.tenant, reserved.membership.publicId, actor);

    const consumed = await createMembership('consumed');
    await client.customerMembershipUsage.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, membershipId: consumed.membership.id, membershipChargeId: consumed.charge.id, serviceId: ids.service, quantity: 1, status: 'CONSUMED' } });
    await service.cancel(ids.tenant, consumed.membership.publicId, actor);
    expect((await client.customerMembership.findUniqueOrThrow({ where: { id: consumed.membership.id } })).status).toBe('CANCELED');

    for (const chargeSource of ['MEMBERSHIP_INCLUDED', 'MEMBERSHIP_DISCOUNT'] as const) {
      const open = await createMembership(`open-${chargeSource}`);
      const appointment = await client.appointment.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, protocol: `CANCEL-${randomUUID().slice(0, 8)}`, customerId: ids.customer, professionalId: ids.professional, serviceId: ids.service, startsAt: new Date(now.getTime() + 86_400_000), endsAt: new Date(now.getTime() + 86_400_000 + 1_800_000), durationMinutes: 30, priceCents: 1000n, chargeSource, amountDueCents: chargeSource === 'MEMBERSHIP_INCLUDED' ? 0n : 500n, status: 'CONFIRMED' } });
      await client.customerMembershipUsage.create({ data: { publicId: randomUUID(), tenantId: ids.tenant, membershipId: open.membership.id, membershipChargeId: open.charge.id, appointmentId: appointment.id, serviceId: ids.service, quantity: 1, status: 'CONSUMED' } });
      await expect(service.cancel(ids.tenant, open.membership.publicId, actor)).rejects.toMatchObject({ code: 'OPEN_MEMBERSHIP_APPOINTMENTS' });
      await client.appointment.update({ where: { id: appointment.id }, data: { status: 'CANCELED' } });
      await service.cancel(ids.tenant, open.membership.publicId, actor);
      expect((await client.customerMembership.findUniqueOrThrow({ where: { id: open.membership.id } })).status).toBe('CANCELED');
    }
    const transitionPreview = await new TenantOperatingModelTransitionService(client).preview(ids.tenant, 'SERVICE_PRICING');
    expect(transitionPreview.canTransition).toBe(true);
    expect(transitionPreview.blockers).toEqual([]);
  });
});
