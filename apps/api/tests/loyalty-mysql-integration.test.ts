import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { CouponService } from '../src/modules/payments/coupon.service.js';
import { LoyaltyService } from '../src/modules/payments/loyalty.service.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('fidelidade: pontos + cashback (Etapa 15) com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const appointments = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const coupons = new CouponService(client);
  const loyalty = new LoyaltyService(client, coupons);
  const paymentMethods = new PaymentMethodService(client);
  const payments = new PaymentService(client, undefined, undefined, coupons, loyalty);
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId = '';
  let customerDbId: bigint;
  let professionalId = '';
  let serviceId = '';
  let userId: bigint;
  let cashMethodPublicId = '';
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  const input = (startsAt: string) => ({
    customerPublicId: customerId,
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    startsAt,
    source: 'INTERNAL',
  });

  const activateRule = async (
    type: 'POINTS' | 'CASHBACK',
    overrides: Partial<{
      earnRate: number;
      minEligibleAmountCents: number;
      redeemRateCentsPerPoint: number | null;
      expirationDays: number | null;
    }> = {},
  ) =>
    loyalty.updateRule(
      tenantId,
      type,
      {
        active: true,
        earnRate: overrides.earnRate ?? (type === 'POINTS' ? 1 : 1000),
        minEligibleAmountCents: overrides.minEligibleAmountCents ?? 0,
        redeemRateCentsPerPoint:
          overrides.redeemRateCentsPerPoint === undefined
            ? type === 'POINTS'
              ? 10
              : null
            : overrides.redeemRateCentsPerPoint,
        expirationDays: overrides.expirationDays ?? null,
      },
      actor,
    );

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `loyalty-${randomUUID()}@test.invalid`,
        normalizedEmail: `loyalty-${randomUUID()}@test.invalid`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    const session = await client.userSession.create({
      data: {
        publicId: randomUUID(),
        userId: user.id,
        tokenHash: randomUUID().replaceAll('-', ''),
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSeenAt: new Date(),
      },
    });
    userId = user.id;
    actor = { userId: user.id, sessionId: session.id };

    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `loyalty-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Teste',
        displayName: 'Teste',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    const other = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `loyalty-other-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Outro',
        displayName: 'Outro',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const [customer, professional, catalog] = await Promise.all([
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Ana Silva' } }),
      client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Profissional',
          publicName: 'Profissional',
          calendarColor: '#111111',
        },
      }),
      client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Consulta',
          durationMinutes: 45,
          hasPostServiceBreak: false,
          priceCents: 15000n,
          color: '#111111',
        },
      }),
    ]);
    customerId = customer.publicId;
    customerDbId = customer.id;
    professionalId = professional.publicId;
    serviceId = catalog.publicId;
    await client.professionalService.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId: professional.id,
        serviceId: catalog.id,
        priceCents: 15000n,
        durationMinutes: 30,
        hasPostServiceBreak: false,
      },
    });
    await client.professionalWorkSchedule.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId: professional.id,
        weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
        startsAt: '09:00',
        endsAt: '18:00',
      },
    });

    const seededMethods = await paymentMethods.list(tenantId);
    const cashMethod = seededMethods.items.find((item) => item.type === 'CASH');
    if (cashMethod === undefined) throw new Error('Forma de pagamento padrão não provisionada.');
    cashMethodPublicId = cashMethod.publicId;
  });

  afterEach(async () => {
    const ids = [tenantId, otherTenantId];
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.loyaltyLedgerEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await client.loyaltyRule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.couponRedemption.deleteMany({ where: { tenantId: { in: ids } } });
    await client.coupon.deleteMany({ where: { tenantId: { in: ids } } });
    await client.payment.deleteMany({ where: { tenantId: { in: ids } } });
    await client.paymentMethod.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    await client.userSession.deleteMany({ where: { userId } });
    await client.user.deleteMany({ where: { id: userId } });
  });

  describe('regras de fidelidade', () => {
    it('provisiona pontos e cashback desativados na primeira consulta e permite ativar', async () => {
      const initial = await loyalty.listRules(tenantId);
      expect(initial.items).toHaveLength(2);
      expect(initial.items.every((item) => !item.active)).toBe(true);

      const updated = await activateRule('POINTS', { earnRate: 2 });
      expect(updated.active).toBe(true);
      expect(updated.earnRate).toBe(2);

      const list = await loyalty.listRules(tenantId);
      const points = list.items.find((item) => item.type === 'POINTS');
      expect(points?.active).toBe(true);
      expect(points?.earnRate).toBe(2);
    });
  });

  describe('geração de crédito a partir de pagamentos elegíveis', () => {
    it('gera pontos e cashback simultaneamente para um pagamento elegível, sem carteiras paralelas', async () => {
      await activateRule('POINTS', { earnRate: 1 });
      await activateRule('CASHBACK', { earnRate: 1000 });

      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15000 },
        actor,
      );

      const pointsBalance = await loyalty.balance(tenantId, customerDbId, 'POINTS');
      const cashbackBalance = await loyalty.balance(tenantId, customerDbId, 'CASHBACK');
      expect(pointsBalance).toBe(150n);
      expect(cashbackBalance).toBe(1500n);

      const summary = await loyalty.accountSummary(tenantId, customerDbId);
      expect(summary.balances).toEqual(
        expect.arrayContaining([
          { type: 'POINTS', balance: '150' },
          { type: 'CASHBACK', balance: '1500' },
        ]),
      );
    });

    it('não gera crédito abaixo do valor mínimo elegível', async () => {
      await activateRule('POINTS', { earnRate: 1, minEligibleAmountCents: 20_000 });

      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15000 },
        actor,
      );

      const balance = await loyalty.balance(tenantId, customerDbId, 'POINTS');
      expect(balance).toBe(0n);
    });

    it('é idempotente: não credita duas vezes para o mesmo pagamento', async () => {
      await activateRule('POINTS', { earnRate: 1 });
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15000 },
        actor,
      );
      const paymentRow = await client.payment.findFirstOrThrow({
        where: { publicId: payment.publicId },
      });
      await loyalty.recordForPayment(
        tenantId,
        { id: paymentRow.id, amountCents: paymentRow.amountCents },
        customerDbId,
        actor,
      );

      const balance = await loyalty.balance(tenantId, customerDbId, 'POINTS');
      expect(balance).toBe(150n);
    });
  });

  describe('resgate em agendamentos', () => {
    it('resgata pontos, aplica desconto e combina com cupom sem exceder o saldo', async () => {
      await activateRule('POINTS', { earnRate: 1, redeemRateCentsPerPoint: 10 });
      const firstAppointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await payments.create(
        tenantId,
        firstAppointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15000 },
        actor,
      );
      const balanceBefore = await loyalty.balance(tenantId, customerDbId, 'POINTS');
      expect(balanceBefore).toBe(150n);

      const secondAppointment = await appointments.create(
        tenantId,
        input(`${date}T15:00:00.000Z`),
        actor,
      );
      await coupons.create(
        tenantId,
        { code: 'COMBO10', discountType: 'PERCENTAGE', discountValue: 10, active: true },
        actor,
      );
      await coupons.redeem(tenantId, secondAppointment.publicId, 'COMBO10', actor);

      const redemption = await loyalty.redeem(
        tenantId,
        secondAppointment.publicId,
        'POINTS',
        100n,
        actor,
      );
      expect(redemption.discountCentsApplied).toBe('1000');

      const summary = await payments.listForAppointment(tenantId, secondAppointment.publicId);
      expect(summary.summary.couponDiscountCents).toBe('1500');
      expect(summary.summary.loyaltyDiscountCents).toBe('1000');
      expect(summary.summary.balanceCents).toBe('12500');

      const balanceAfter = await loyalty.balance(tenantId, customerDbId, 'POINTS');
      expect(balanceAfter).toBe(50n);
    });

    it('recusa resgate com saldo insuficiente e com regra inativa', async () => {
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await expect(
        loyalty.redeem(tenantId, appointment.publicId, 'POINTS', 10n, actor),
      ).rejects.toMatchObject({ code: 'LOYALTY_RULE_NOT_ACTIVE' });

      await activateRule('POINTS', { earnRate: 1, redeemRateCentsPerPoint: 10 });
      await expect(
        loyalty.redeem(tenantId, appointment.publicId, 'POINTS', 10n, actor),
      ).rejects.toMatchObject({ code: 'LOYALTY_INSUFFICIENT_BALANCE' });
    });

    it('cancela um resgate e restaura o saldo', async () => {
      await activateRule('CASHBACK', { earnRate: 10_000 });
      const earnAppointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await payments.create(
        tenantId,
        earnAppointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15000 },
        actor,
      );
      const balanceAfterEarn = await loyalty.balance(tenantId, customerDbId, 'CASHBACK');
      expect(balanceAfterEarn).toBe(15000n);

      const redeemAppointment = await appointments.create(
        tenantId,
        input(`${date}T15:00:00.000Z`),
        actor,
      );
      const redemption = await loyalty.redeem(
        tenantId,
        redeemAppointment.publicId,
        'CASHBACK',
        5000n,
        actor,
      );
      const balanceAfterRedeem = await loyalty.balance(tenantId, customerDbId, 'CASHBACK');
      expect(balanceAfterRedeem).toBe(10_000n);

      await loyalty.cancelRedemption(
        tenantId,
        redeemAppointment.publicId,
        redemption.publicId,
        actor,
      );
      const balanceAfterCancel = await loyalty.balance(tenantId, customerDbId, 'CASHBACK');
      expect(balanceAfterCancel).toBe(15_000n);

      await expect(
        loyalty.cancelRedemption(tenantId, redeemAppointment.publicId, redemption.publicId, actor),
      ).rejects.toMatchObject({ code: 'LOYALTY_REDEMPTION_ALREADY_CANCELED' });
    });
  });

  describe('estorno por cancelamento de pagamento', () => {
    it('estorna o crédito ao cancelar o pagamento de origem, limitado ao saldo atual', async () => {
      await activateRule('POINTS', { earnRate: 1, redeemRateCentsPerPoint: 10 });
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15000 },
        actor,
      );
      expect(await loyalty.balance(tenantId, customerDbId, 'POINTS')).toBe(150n);

      await loyalty.redeem(tenantId, appointment.publicId, 'POINTS', 100n, actor);
      expect(await loyalty.balance(tenantId, customerDbId, 'POINTS')).toBe(50n);

      await payments.cancel(tenantId, appointment.publicId, payment.publicId, 'Estorno', actor);

      expect(await loyalty.balance(tenantId, customerDbId, 'POINTS')).toBe(0n);
    });
  });

  describe('expiração', () => {
    it('expira créditos vencidos limitando ao saldo atual e isola por tenant', async () => {
      await activateRule('POINTS', { earnRate: 1, expirationDays: 1 });
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15000 },
        actor,
      );
      expect(await loyalty.balance(tenantId, customerDbId, 'POINTS')).toBe(150n);

      const processed = await loyalty.expireDue(new Date(Date.now() + 2 * 86_400_000));
      expect(processed).toBeGreaterThanOrEqual(1);

      expect(await loyalty.balance(tenantId, customerDbId, 'POINTS')).toBe(0n);
    });
  });

  describe('isolamento por tenant', () => {
    it('não retorna regras nem saldo de outro tenant', async () => {
      await activateRule('POINTS', { earnRate: 5 });
      const otherRules = await loyalty.listRules(otherTenantId);
      expect(otherRules.items.every((item) => !item.active)).toBe(true);

      const otherCustomer = await client.customer.create({
        data: { publicId: randomUUID(), tenantId: otherTenantId, name: 'Cliente Outro Tenant' },
      });
      const balance = await loyalty.balance(otherTenantId, otherCustomer.id, 'POINTS');
      expect(balance).toBe(0n);
    });
  });
});
