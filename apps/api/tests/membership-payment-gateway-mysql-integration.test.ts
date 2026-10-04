import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentGatewayService } from '../src/modules/payments/gateway/payment-gateway.service.js';
import { PaymentGatewayProviderRegistry } from '../src/modules/payments/gateway/provider-registry.js';
import { CredentialsCipher } from '../src/modules/payments/gateway/credentials-cipher.js';
import { type GatewayChargeInput, type GatewayChargeResult, type GatewayWebhookEvent, type PaymentGatewayProviderAdapter } from '../src/modules/payments/gateway/provider.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { ProfessionalCommissionService } from '../src/modules/payments/professional-commission.service.js';
import { createPrismaClient } from '../src/database/connection.js';
import { CustomerMembershipPaymentService } from '../src/modules/customers/customer-membership-payment.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL é obrigatória para este teste.');
const prisma = createPrismaClient(url);
const payments = new CustomerMembershipPaymentService(prisma);
class MembershipProvider implements PaymentGatewayProviderAdapter {
  readonly name = 'membership-test-provider';
  createCalls = 0;
  nextStatus: 'PENDING' | 'PAID' = 'PENDING';
  failCreate = false;
  getCalls = 0;

  async createCharge(_credentials: Record<string, unknown>, _environment: 'SANDBOX' | 'PRODUCTION', input: GatewayChargeInput): Promise<GatewayChargeResult> {
    this.createCalls += 1;
    if (this.failCreate) throw new Error('membership provider failure');
    return { externalId: `membership-ext-${input.idempotencyKey}`, status: this.nextStatus, raw: {} };
  }

  async getCharge(_credentials: Record<string, unknown>, _environment: 'SANDBOX' | 'PRODUCTION', externalId: string): Promise<GatewayChargeResult> {
    this.getCalls += 1;
    return { externalId, status: this.nextStatus, raw: {} };
  }

  async cancelCharge(): Promise<void> {}
  verifyWebhookSignature(credentials: Record<string, unknown>, _environment: 'SANDBOX' | 'PRODUCTION', _rawBody: string, headers: Record<string, string>): boolean {
    return headers['x-signature'] === credentials.secret;
  }
  parseWebhookEvent(rawBody: string): GatewayWebhookEvent {
    const parsed = JSON.parse(rawBody) as { externalEventId: string; externalId: string; status: 'PENDING' | 'PAID' };
    return { externalEventId: parsed.externalEventId, externalId: parsed.externalId, status: parsed.status, raw: parsed };
  }
}
let ids: { tenantId: bigint; customerId: bigint; planId: bigint; membershipId: bigint; chargeId: bigint; methodId: bigint };
let gateway: PaymentGatewayService;
let provider: MembershipProvider;

beforeAll(async () => {
  const rows = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
  if (rows[0]?.db !== 'u891593158_teste') throw new Error('Refusing to run integration tests against non-test database.');
});

beforeEach(async () => {
  provider = new MembershipProvider();
  const tenant = await prisma.tenant.create({ data: { publicId: randomUUID(), slug: `membership-${randomUUID().slice(0, 8)}`, legalName: 'Membership Teste', displayName: 'Membership Teste', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL' } });
  const customer = await prisma.customer.create({ data: { publicId: randomUUID(), tenantId: tenant.id, name: 'Cliente Membership', status: 'ACTIVE' } });
  const plan = await prisma.customerMembershipPlan.create({ data: { publicId: randomUUID(), tenantId: tenant.id, name: 'Plano Teste', priceCents: 9900n, billingInterval: 'MONTHLY', active: true } });
  const membership = await prisma.customerMembership.create({ data: { publicId: randomUUID(), tenantId: tenant.id, customerId: customer.id, planId: plan.id, status: 'PENDING', activeKey: `test:${randomUUID()}` } });
  const charge = await prisma.customerMembershipCharge.create({ data: { publicId: randomUUID(), tenantId: tenant.id, membershipId: membership.id, periodStart: new Date('2026-01-01T00:00:00.000Z'), periodEnd: new Date('2026-02-01T00:00:00.000Z'), amountCents: 9900n, status: 'PENDING', dueAt: new Date('2026-01-02T00:00:00.000Z') } });
  const method = await prisma.paymentMethod.create({ data: { publicId: randomUUID(), tenantId: tenant.id, name: 'PIX Membership Teste', type: 'PIX', active: true } });
  ids = { tenantId: tenant.id, customerId: customer.id, planId: plan.id, membershipId: membership.id, chargeId: charge.id, methodId: method.id };
  const registry = new PaymentGatewayProviderRegistry();
  registry.register(provider);
  gateway = new PaymentGatewayService(
    prisma,
    registry,
    new CredentialsCipher('807d15aaaa7796bd7ca1d604c597cc077b854680fa938e9328edcaf498d95edb'),
    new PaymentMethodService(prisma),
    new PaymentService(prisma, undefined, new ProfessionalCommissionService(prisma)),
    undefined,
    payments,
  );
  await gateway.upsertConfig(ids.tenantId, { provider: provider.name, active: true, environment: 'SANDBOX', credentials: { secret: 'membership-secret' } }, { userId: null, sessionId: null });
});

afterEach(async () => {
  await prisma.paymentGatewayCharge.updateMany({ where: { tenantId: ids.tenantId }, data: { paymentId: null } });
  await prisma.payment.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.paymentGatewayConfig.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.paymentGatewayEvent.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.paymentGatewayCharge.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.customerMembershipCharge.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.customerMembership.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.paymentMethod.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.customerMembershipPlan.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId: ids.tenantId } });
  await prisma.tenant.delete({ where: { id: ids.tenantId } });
});

describe('membership payment core no MariaDB', () => {
  it('cria um Payment efetivo, quita charge, ativa membership e audita', async () => {
    const payment = await payments.createPayment(ids.tenantId, (await prisma.customerMembershipCharge.findUnique({ where: { id: ids.chargeId } }))!.publicId, ids.methodId, { userId: null, sessionId: null });
    const charge = await prisma.customerMembershipCharge.findUnique({ where: { id: ids.chargeId } });
    const membership = await prisma.customerMembership.findUnique({ where: { id: ids.membershipId } });
    const audit = await prisma.auditLog.count({ where: { tenantId: ids.tenantId, action: 'customer_membership_charge.payment' } });
    expect(payment.originType).toBe('MEMBERSHIP_CHARGE');
    expect(payment.membershipChargeId).toBe(ids.chargeId);
    expect(payment.amountCents).toBe(9900n);
    expect(payment.status).toBe('PAID');
    expect(charge?.status).toBe('PAID');
    expect(charge?.paidAt).not.toBeNull();
    expect(membership?.status).toBe('ACTIVE');
    expect(audit).toBe(1);
  });

  it('é idempotente e duas confirmações concorrentes mantêm um Payment', async () => {
    const charge = await prisma.customerMembershipCharge.findUnique({ where: { id: ids.chargeId } });
    const input = [1, 2].map(() => payments.createPayment(ids.tenantId, charge!.publicId, ids.methodId, { userId: null, sessionId: null }));
    const result = await Promise.all(input);
    const count = await prisma.payment.count({ where: { tenantId: ids.tenantId, membershipChargeId: ids.chargeId, status: 'PAID' } });
    expect(result[0]?.id).toBe(result[1]?.id);
    expect(count).toBe(1);
  });

  it('cria gateway membership usando valor do banco e idempotencyKey determinística', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    const created = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    const persisted = await prisma.paymentGatewayCharge.findUniqueOrThrow({ where: { publicId: created.publicId } });
    expect(persisted.originType).toBe('MEMBERSHIP_CHARGE');
    expect(persisted.membershipChargeId).toBe(ids.chargeId);
    expect(persisted.appointmentId).toBeNull();
    expect(persisted.debtId).toBeNull();
    expect(persisted.amountCents).toBe(9900n);
    expect(persisted.currency).toBe('BRL');
    expect(persisted.idempotencyKey).toBe(`membership-charge:${charge.publicId}:${provider.name}:1`);
    expect(provider.createCalls).toBe(1);
  });

  it('reutiliza PENDING/PROCESSING recente e cria attempt 2 para FAILED, CANCELED e EXPIRED', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    const first = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    const second = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    expect(second.publicId).toBe(first.publicId);
    expect(provider.createCalls).toBe(1);

    await prisma.paymentGatewayCharge.update({ where: { publicId: first.publicId }, data: { status: 'FAILED' } });
    const retry = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    expect(retry.idempotencyKey).toBe(`membership-charge:${charge.publicId}:${provider.name}:2`);

    await prisma.paymentGatewayCharge.update({ where: { publicId: retry.publicId }, data: { status: 'CANCELED' } });
    const canceledRetry = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    expect(canceledRetry.idempotencyKey).toBe(`membership-charge:${charge.publicId}:${provider.name}:3`);

    await prisma.paymentGatewayCharge.update({ where: { publicId: canceledRetry.publicId }, data: { status: 'EXPIRED' } });
    const expiredRetry = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    expect(expiredRetry.idempotencyKey).toBe(`membership-charge:${charge.publicId}:${provider.name}:4`);
  });

  it('converte PROCESSING stale em FAILED e cria tentativa seguinte determinística', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    const first = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    await prisma.$executeRaw`UPDATE payment_gateway_charges SET status = 'PROCESSING', updated_at = DATE_SUB(NOW(), INTERVAL 16 MINUTE) WHERE public_id = ${first.publicId}`;
    const retry = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    const old = await prisma.paymentGatewayCharge.findUniqueOrThrow({ where: { publicId: first.publicId } });
    expect(old.status).toBe('FAILED');
    expect(retry.idempotencyKey).toBe(`membership-charge:${charge.publicId}:${provider.name}:2`);
  });

  it('rejeita retry quando membership charge está PAID ou REFUNDED', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    await prisma.customerMembershipCharge.update({ where: { id: ids.chargeId }, data: { status: 'PAID', paidAt: new Date() } });
    await expect(gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null })).rejects.toMatchObject({ code: 'CUSTOMER_MEMBERSHIP_CHARGE_ALREADY_PAID' });
    await prisma.customerMembershipCharge.update({ where: { id: ids.chargeId }, data: { status: 'REFUNDED' } });
    await expect(gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null })).rejects.toMatchObject({ code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_PAYABLE' });
    expect(await prisma.paymentGatewayCharge.count({ where: { tenantId: ids.tenantId } })).toBe(0);
  });

  it('mantém uma tentativa lógica quando duas criações gateway concorrem', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    const result = await Promise.all([
      gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null }),
      gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null }),
    ]);
    expect(new Set(result.map((item) => item.publicId)).size).toBe(1);
    expect(await prisma.paymentGatewayCharge.count({ where: { tenantId: ids.tenantId } })).toBe(1);
  });

  it('marca tentativa FAILED e permite retry quando provider falha', async () => {
    provider.failCreate = true;
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    await expect(gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null })).rejects.toThrow('membership provider failure');
    const attempt = await prisma.paymentGatewayCharge.findFirstOrThrow({ where: { tenantId: ids.tenantId, membershipChargeId: ids.chargeId } });
    expect(attempt.status).toBe('FAILED');
    expect(await prisma.payment.count({ where: { tenantId: ids.tenantId } })).toBe(0);
    expect(await prisma.paymentGatewayEvent.count({ where: { tenantId: ids.tenantId, success: false } })).toBe(1);
    provider.failCreate = false;
    const retry = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    expect(retry.idempotencyKey).toContain(':2');
  });

  it('reconcilia webhook PAID duplicado e refresh PAID sem duplicar Payment', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    const created = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ids.tenantId } });
    const body = JSON.stringify({ externalEventId: randomUUID(), externalId: created.externalId, status: 'PAID' });
    const first = await gateway.handleWebhook(tenant.publicId, provider.name, body, { 'x-signature': 'membership-secret' });
    const duplicate = await gateway.handleWebhook(tenant.publicId, provider.name, body, { 'x-signature': 'membership-secret' });
    expect(first).toMatchObject({ matched: true, deduplicated: false });
    expect(duplicate).toMatchObject({ deduplicated: true });
    expect(await prisma.payment.count({ where: { tenantId: ids.tenantId, membershipChargeId: ids.chargeId } })).toBe(1);
    expect((await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } })).status).toBe('PAID');
    provider.nextStatus = 'PAID';
    await gateway.getCharge(ids.tenantId, created.publicId, true);
    await gateway.getCharge(ids.tenantId, created.publicId, true);
    expect(await prisma.payment.count({ where: { tenantId: ids.tenantId, membershipChargeId: ids.chargeId } })).toBe(1);
  });

  it('converge após sucesso externo e falha da persistência local usando a mesma tentativa', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    const updateSpy = vi.spyOn(prisma.paymentGatewayCharge, 'update').mockImplementationOnce(async () => {
      throw new Error('simulated local persistence failure');
    });
    await expect(gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null })).rejects.toThrow('simulated local persistence failure');
    updateSpy.mockRestore();

    const retry = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    const persisted = await prisma.paymentGatewayCharge.findUniqueOrThrow({ where: { publicId: retry.publicId } });
    expect(retry.idempotencyKey).toBe(`membership-charge:${charge.publicId}:${provider.name}:1`);
    expect(persisted.externalId).toBe(`membership-ext-${retry.idempotencyKey}`);
    expect(persisted.status).toBe('PENDING');
    expect(provider.createCalls).toBe(2);
  });

  it('manual e webhook PAID concorrentes convergem para um Payment', async () => {
    const charge = await prisma.customerMembershipCharge.findUniqueOrThrow({ where: { id: ids.chargeId } });
    const created = await gateway.createMembershipCharge(ids.tenantId, charge.publicId, provider.name, { userId: null, sessionId: null });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ids.tenantId } });
    const body = JSON.stringify({ externalEventId: randomUUID(), externalId: created.externalId, status: 'PAID' });
    const results = await Promise.allSettled([
      gateway.confirmManualCharge(ids.tenantId, created.publicId, { userId: null, sessionId: null }),
      gateway.handleWebhook(tenant.publicId, provider.name, body, { 'x-signature': 'membership-secret' }),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.payment.count({ where: { tenantId: ids.tenantId, membershipChargeId: ids.chargeId } })).toBe(1);
  });
});
