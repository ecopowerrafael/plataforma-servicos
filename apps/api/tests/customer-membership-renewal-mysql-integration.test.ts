import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/database/connection.js';
import { CustomerMembershipRenewalSweepService } from '../src/modules/customers/customer-membership-renewal-sweep.service.js';
import { CustomerMembershipPaymentService } from '../src/modules/customers/customer-membership-payment.service.js';
import { CustomerMembershipRepository } from '../src/modules/customers/customer-membership.repository.js';
import { CustomerMembershipService } from '../src/modules/customers/customer-membership.service.js';
import { CustomerMembershipBenefitResolver } from '../src/modules/customers/customer-membership-benefit-resolver.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL é obrigatória para este teste.');

const clientA = createPrismaClient(url);
const clientB = createPrismaClient(url);
let tenantId: bigint;
let membershipId: bigint;
let methodId: bigint;
let serviceId: bigint;

describe('customer membership renewal - MySQL real', () => {
  beforeAll(async () => {
    const database = await clientA.$queryRaw<Array<{ databaseName: string }>>`SELECT DATABASE() AS databaseName`;
    if (database[0]?.databaseName !== 'agendei_renewal_integration') throw new Error('Teste recusado fora do banco temporário agendei_renewal_integration.');
    const tenant = await clientA.tenant.create({ data: { publicId: randomUUID(), slug: `renewal-${randomUUID().slice(0, 8)}`, legalName: 'Renewal Integration', displayName: 'Renewal Integration', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL', operatingModel: 'MEMBERSHIP' } });
    tenantId = tenant.id;
    const customer = await clientA.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Renewal Customer', status: 'ACTIVE' } });
    const plan = await clientA.customerMembershipPlan.create({ data: { publicId: randomUUID(), tenantId, name: 'Renewal Plan', priceCents: 9900n, billingInterval: 'MONTHLY', active: true } });
    const service = await clientA.service.create({ data: { publicId: randomUUID(), tenantId, name: `Renewal Service ${randomUUID()}`, durationMinutes: 60, priceCents: 10000n, color: '#123456' } });
    serviceId = service.id;
    await clientA.customerMembershipPlanBenefit.create({ data: { publicId: randomUUID(), planId: plan.id, serviceId, type: 'QUANTITY', quantityPerCycle: 1 } });
    const start = new Date('2026-09-01T15:00:00.000Z');
    const end = new Date('2026-10-01T15:00:00.000Z');
    const membership = await clientA.customerMembership.create({ data: { publicId: randomUUID(), tenantId, customerId: customer.id, planId: plan.id, status: 'ACTIVE', activeKey: `${tenantId}:${customer.id}:${randomUUID()}`, startedAt: start, currentPeriodStart: start, currentPeriodEnd: end, nextBillingAt: end } });
    membershipId = membership.id;
    const initialCharge = await clientA.customerMembershipCharge.create({ data: { publicId: randomUUID(), tenantId, membershipId, periodStart: start, periodEnd: end, amountCents: 9900n, status: 'PAID', paidAt: start, dueAt: start, planSnapshot: { priceCents: 9900, billingInterval: 'MONTHLY', benefits: [{ serviceId: serviceId.toString(), type: 'QUANTITY', quantityPerCycle: 1 }] } } });
    await clientA.customerMembershipUsage.create({ data: { publicId: randomUUID(), tenantId, membershipId, membershipChargeId: initialCharge.id, appointmentId: null, serviceId, quantity: 1, status: 'CONSUMED' } });
    const method = await clientA.paymentMethod.create({ data: { publicId: randomUUID(), tenantId, name: `Renewal PIX ${randomUUID()}`, type: 'PIX', active: true } });
    methodId = method.id;
  }, 30_000);

  afterAll(async () => {
    if (tenantId !== undefined) {
      await clientA.customerMembershipUsage.deleteMany({ where: { tenantId } });
      await clientA.payment.deleteMany({ where: { tenantId } });
      await clientA.customerMembershipCharge.deleteMany({ where: { tenantId } });
      await clientA.customerMembership.deleteMany({ where: { tenantId } });
      await clientA.customerMembershipPlan.deleteMany({ where: { tenantId } });
      await clientA.service.deleteMany({ where: { tenantId } });
      await clientA.paymentMethod.deleteMany({ where: { tenantId } });
      await clientA.customer.deleteMany({ where: { tenantId } });
      await clientA.auditLog.deleteMany({ where: { tenantId } });
      await clientA.tenant.delete({ where: { id: tenantId } });
    }
    await clientA.$disconnect();
    await clientB.$disconnect();
  });

  it('gera uma única charge sob dez sweeps concorrentes e paga sem drift', async () => {
    const now = new Date('2026-10-01T15:00:00.000Z');
    const membershipService = new CustomerMembershipService(new CustomerMembershipRepository(clientA));
    const actor = { userId: null as never, sessionId: null as never };
    const membershipPublicId = (await clientA.customerMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { publicId: true } })).publicId;
    await membershipService.scheduleCancelAtPeriodEnd(tenantId, membershipPublicId, actor);
    await membershipService.revokeCancelAtPeriodEnd(tenantId, membershipPublicId, actor);
    await membershipService.scheduleCancelAtPeriodEnd(tenantId, membershipPublicId, actor);
    await membershipService.revokeCancelAtPeriodEnd(tenantId, membershipPublicId, actor);
    await clientA.customerMembershipPlan.update({ where: { id: (await clientA.customerMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { planId: true } })).planId }, data: { priceCents: 15000n, billingInterval: 'ANNUAL' } });
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => new CustomerMembershipRenewalSweepService(index % 2 === 0 ? clientA : clientB).run(now)));
    const charges = await clientA.customerMembershipCharge.findMany({ where: { membershipId }, orderBy: { periodStart: 'asc' } });
    expect(charges).toHaveLength(2);
    const renewal = charges[1]!;
    expect(renewal.status).toBe('PENDING');
    expect(renewal.amountCents).toBe(9900n);
    expect((renewal.planSnapshot as { priceCents: number }).priceCents).toBe(9900);
    expect(renewal.periodEnd).toEqual(new Date('2026-11-01T15:00:00.000Z'));
    expect(renewal.periodStart).toEqual(now);
    expect((await clientA.customerMembership.findUniqueOrThrow({ where: { id: membershipId } })).status).toBe('PAST_DUE');
    expect(results.reduce((sum, result) => sum + result.renewedChargesCreated, 0)).toBe(1);

    const paymentService = new CustomerMembershipPaymentService(clientA);
    await paymentService.createPayment(tenantId, renewal.publicId, methodId, { userId: null, sessionId: null });
    const paid = await clientA.customerMembership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(paid.status).toBe('ACTIVE');
    expect(paid.currentPeriodStart).toEqual(renewal.periodStart);
    expect(paid.currentPeriodEnd).toEqual(renewal.periodEnd);
    expect(paid.nextBillingAt).toEqual(renewal.periodEnd);
    const benefit = await new CustomerMembershipBenefitResolver(clientA).resolveBenefit(tenantId, (await clientA.customerMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { customerId: true } })).customerId, serviceId, 10000n);
    expect(benefit.covered).toBe(true);
    expect(benefit.available).toBe(1);
    expect(benefit.membershipChargeId).toBe(renewal.id);

    await clientA.customerMembership.update({ where: { id: membershipId }, data: { status: 'ACTIVE', nextBillingAt: renewal.periodEnd } });
    const n2Sweep = await new CustomerMembershipRenewalSweepService(clientA).run(new Date(renewal.periodEnd.getTime() + 1));
    expect(n2Sweep.renewedChargesCreated).toBe(1);
    const n2 = await clientA.customerMembershipCharge.findFirstOrThrow({ where: { membershipId, periodStart: renewal.periodEnd } });
    expect(n2.periodStart).toEqual(renewal.periodEnd);
    expect(await clientA.customerMembershipCharge.count({ where: { membershipId } })).toBe(3);
    expect((await new CustomerMembershipRenewalSweepService(clientA).run(new Date(renewal.periodEnd.getTime() + 2))).renewedChargesCreated).toBe(0);
    await paymentService.createPayment(tenantId, n2.publicId, methodId, { userId: null, sessionId: null });

    await clientA.customerMembership.update({ where: { id: membershipId }, data: { cancelAtPeriodEnd: true, nextBillingAt: n2.periodEnd } });
    const boundary = new Date(n2.periodEnd.getTime() + 1);
    const cancellation = new CustomerMembershipRenewalSweepService(clientA);
    expect((await cancellation.run(boundary)).cancelAtPeriodEndApplied).toBe(1);
    expect((await cancellation.run(boundary)).cancelAtPeriodEndApplied).toBe(0);
    const final = await clientA.customerMembership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(final.status).toBe('CANCELED');
    expect(final.nextBillingAt).toBeNull();
    expect(final.cancelAtPeriodEnd).toBe(false);
    expect(await clientA.customerMembershipCharge.count({ where: { membershipId } })).toBe(3);
    expect(await clientA.auditLog.count({ where: { tenantId, action: 'customer_membership.cancel_period_end_applied' } })).toBe(1);
  });
});
