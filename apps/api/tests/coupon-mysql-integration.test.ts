import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { CouponService } from '../src/modules/payments/coupon.service.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('cupons de desconto (Etapa 15) com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const appointments = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const coupons = new CouponService(client);
  const paymentMethods = new PaymentMethodService(client);
  const payments = new PaymentService(client, undefined, undefined, coupons);
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId = '';
  let otherCustomerId = '';
  let professionalId = '';
  let serviceId = '';
  let userId: bigint;
  let cashMethodPublicId = '';
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  const input = (startsAt: string, customer = customerId) => ({
    customerPublicId: customer,
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    startsAt,
    source: 'INTERNAL',
  });

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `coupon-${randomUUID()}@test.invalid`,
        normalizedEmail: `coupon-${randomUUID()}@test.invalid`,
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
        slug: `coupon-${suffix}-${randomUUID().slice(0, 4)}`,
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
        slug: `coupon-other-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Outro',
        displayName: 'Outro',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const [customer, secondCustomer, professional, catalog] = await Promise.all([
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Ana Silva' } }),
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Bruno Souza' } }),
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
    otherCustomerId = secondCustomer.publicId;
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

  describe('cadastro de cupons', () => {
    it('cria um cupom e recusa código duplicado no mesmo tenant', async () => {
      const created = await coupons.create(
        tenantId,
        { code: 'BEMVINDO10', discountType: 'PERCENTAGE', discountValue: 10, active: true },
        actor,
      );
      expect(created.code).toBe('BEMVINDO10');
      expect(created.usageCount).toBe(0);

      await expect(
        coupons.create(
          tenantId,
          { code: 'BEMVINDO10', discountType: 'FIXED', discountValue: 500, active: true },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'COUPON_CODE_CONFLICT' });
    });

    it('isola cupons por tenant', async () => {
      await coupons.create(
        tenantId,
        { code: 'ISOLADO', discountType: 'PERCENTAGE', discountValue: 10, active: true },
        actor,
      );
      const otherList = await coupons.list(otherTenantId);
      expect(otherList.items).toHaveLength(0);

      const created = await coupons.create(
        otherTenantId,
        { code: 'ISOLADO', discountType: 'FIXED', discountValue: 100, active: true },
        actor,
      );
      expect(created.code).toBe('ISOLADO');
    });
  });

  describe('aplicação de cupom reduz o saldo sem criar pagamento fictício', () => {
    it('aplica desconto percentual e reflete no saldo do agendamento', async () => {
      await coupons.create(
        tenantId,
        { code: 'PERC20', discountType: 'PERCENTAGE', discountValue: 20, active: true },
        actor,
      );
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );

      const redemption = await coupons.redeem(tenantId, appointment.publicId, 'PERC20', actor);
      expect(redemption.discountAmountCents).toBe('3000');

      const summary = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(summary.items).toHaveLength(0);
      expect(summary.summary.couponDiscountCents).toBe('3000');
      expect(summary.summary.balanceCents).toBe('12000');
    });

    it('aplica desconto fixo limitado ao saldo disponível', async () => {
      await coupons.create(
        tenantId,
        { code: 'FIXO20000', discountType: 'FIXED', discountValue: 20_000, active: true },
        actor,
      );
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );

      const redemption = await coupons.redeem(tenantId, appointment.publicId, 'FIXO20000', actor);
      expect(redemption.discountAmountCents).toBe('15000');

      const summary = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(summary.summary.balanceCents).toBe('0');
    });

    it('um pagamento real após o desconto respeita o novo saldo', async () => {
      await coupons.create(
        tenantId,
        { code: 'PERC50', discountType: 'PERCENTAGE', discountValue: 50, active: true },
        actor,
      );
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await coupons.redeem(tenantId, appointment.publicId, 'PERC50', actor);

      await expect(
        payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 8000 },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_APPOINTMENT_PRICE' });

      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 7500 },
        actor,
      );
      expect(payment.amountCents).toBe('7500');

      const summary = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(summary.summary.balanceCents).toBe('0');
    });
  });

  describe('validações de cupom', () => {
    it('recusa cupom inexistente ou inativo', async () => {
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await expect(
        coupons.redeem(tenantId, appointment.publicId, 'INEXISTENTE', actor),
      ).rejects.toMatchObject({ code: 'COUPON_NOT_FOUND' });

      await coupons.create(
        tenantId,
        { code: 'INATIVO', discountType: 'PERCENTAGE', discountValue: 10, active: false },
        actor,
      );
      await expect(
        coupons.redeem(tenantId, appointment.publicId, 'INATIVO', actor),
      ).rejects.toMatchObject({ code: 'COUPON_NOT_FOUND' });
    });

    it('recusa cupom fora da janela de validade', async () => {
      const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const past = new Date(Date.now() - 30 * 86_400_000).toISOString();
      await coupons.create(
        tenantId,
        {
          code: 'FUTURO',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          active: true,
          validFrom: future,
        },
        actor,
      );
      await coupons.create(
        tenantId,
        {
          code: 'EXPIRADO',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          active: true,
          validUntil: past,
        },
        actor,
      );
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await expect(
        coupons.redeem(tenantId, appointment.publicId, 'FUTURO', actor),
      ).rejects.toMatchObject({ code: 'COUPON_NOT_YET_VALID' });
      await expect(
        coupons.redeem(tenantId, appointment.publicId, 'EXPIRADO', actor),
      ).rejects.toMatchObject({ code: 'COUPON_EXPIRED' });
    });

    it('bloqueia reaplicação do mesmo cupom no mesmo agendamento', async () => {
      await coupons.create(
        tenantId,
        { code: 'UNICO', discountType: 'PERCENTAGE', discountValue: 10, active: true },
        actor,
      );
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await coupons.redeem(tenantId, appointment.publicId, 'UNICO', actor);
      await expect(
        coupons.redeem(tenantId, appointment.publicId, 'UNICO', actor),
      ).rejects.toMatchObject({ code: 'COUPON_ALREADY_REDEEMED_FOR_APPOINTMENT' });
    });

    it('respeita o limite total de usos e o limite por cliente', async () => {
      await coupons.create(
        tenantId,
        {
          code: 'LIMITADO',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          active: true,
          maxUses: 1,
        },
        actor,
      );
      const first = await appointments.create(tenantId, input(`${date}T13:00:00.000Z`), actor);
      const second = await appointments.create(
        tenantId,
        input(`${date}T15:00:00.000Z`, otherCustomerId),
        actor,
      );
      await coupons.redeem(tenantId, first.publicId, 'LIMITADO', actor);
      await expect(
        coupons.redeem(tenantId, second.publicId, 'LIMITADO', actor),
      ).rejects.toMatchObject({ code: 'COUPON_USAGE_LIMIT_REACHED' });

      await coupons.create(
        tenantId,
        {
          code: 'PORCLIENTE',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          active: true,
          maxUsesPerCustomer: 1,
        },
        actor,
      );
      const thirdSameCustomer = await appointments.create(
        tenantId,
        input(`${date}T17:00:00.000Z`),
        actor,
      );
      await coupons.redeem(tenantId, first.publicId, 'PORCLIENTE', actor);
      await expect(
        coupons.redeem(tenantId, thirdSameCustomer.publicId, 'PORCLIENTE', actor),
      ).rejects.toMatchObject({ code: 'COUPON_CUSTOMER_USAGE_LIMIT_REACHED' });
    });

    it('recusa aplicar cupom a agendamento cancelado e isola por tenant', async () => {
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await appointments.status(tenantId, appointment.publicId, 'CANCELED', 'Motivo', actor);
      await coupons.create(
        tenantId,
        { code: 'TESTE', discountType: 'PERCENTAGE', discountValue: 10, active: true },
        actor,
      );
      await expect(
        coupons.redeem(tenantId, appointment.publicId, 'TESTE', actor),
      ).rejects.toMatchObject({ code: 'COUPON_NOT_ALLOWED_FOR_CANCELED_APPOINTMENT' });

      const otherCustomer = await client.customer.create({
        data: { publicId: randomUUID(), tenantId: otherTenantId, name: 'Outro Cliente' },
      });
      const otherProfessional = await client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId: otherTenantId,
          name: 'Outro Profissional',
          publicName: 'Outro Profissional',
          calendarColor: '#222222',
        },
      });
      const otherService = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId: otherTenantId,
          name: 'Outro Serviço',
          durationMinutes: 30,
          hasPostServiceBreak: false,
          priceCents: 5000n,
          color: '#333333',
        },
      });
      const otherAppointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 8)}`,
          tenant: { connect: { id: otherTenantId } },
          customer: { connect: { id: otherCustomer.id } },
          professional: { connect: { id: otherProfessional.id } },
          service: { connect: { id: otherService.id } },
          startsAt: new Date(`${date}T13:00:00.000Z`),
          endsAt: new Date(`${date}T13:30:00.000Z`),
          durationMinutes: 30,
          priceCents: 5000n,
        },
      });
      await expect(
        coupons.redeem(otherTenantId, otherAppointment.publicId, 'TESTE', actor),
      ).rejects.toMatchObject({ code: 'COUPON_NOT_FOUND' });
    });
  });

  describe('cancelamento de redenção', () => {
    it('cancela a aplicação do cupom e o saldo volta ao normal', async () => {
      await coupons.create(
        tenantId,
        { code: 'CANCELAVEL', discountType: 'PERCENTAGE', discountValue: 30, active: true },
        actor,
      );
      const appointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      const redemption = await coupons.redeem(tenantId, appointment.publicId, 'CANCELAVEL', actor);

      const beforeCancel = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(beforeCancel.summary.balanceCents).toBe('10500');

      await coupons.cancelRedemption(
        tenantId,
        appointment.publicId,
        redemption.publicId,
        'Cliente desistiu do cupom',
        actor,
      );

      const afterCancel = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(afterCancel.summary.balanceCents).toBe('15000');
      expect(afterCancel.summary.couponDiscountCents).toBe('0');

      await expect(
        coupons.cancelRedemption(
          tenantId,
          appointment.publicId,
          redemption.publicId,
          'Duplicado',
          actor,
        ),
      ).rejects.toMatchObject({ code: 'COUPON_REDEMPTION_ALREADY_CANCELED' });
    });
  });
});
