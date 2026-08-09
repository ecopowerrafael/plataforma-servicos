import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('pagamentos de agendamentos (Etapa 14) com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const appointments = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const payments = new PaymentService(client);
  const paymentMethods = new PaymentMethodService(client);
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId = '';
  let professionalId = '';
  let serviceId = '';
  let userId: bigint;
  let cashMethodPublicId = '';
  let pixMethodPublicId = '';
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const start = `${date}T15:00:00.000Z`;
  const input = (
    startsAt: string,
    deposit?: { depositType: 'FIXED' | 'PERCENTAGE'; depositValue: number },
  ) => ({
    customerPublicId: customerId,
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    startsAt,
    source: 'INTERNAL',
    ...deposit,
  });

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `payment-${randomUUID()}@test.invalid`,
        normalizedEmail: `payment-${randomUUID()}@test.invalid`,
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
        slug: `payment-${suffix}-${randomUUID().slice(0, 4)}`,
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
        slug: `payment-other-${suffix}-${randomUUID().slice(0, 4)}`,
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
    const pixMethod = seededMethods.items.find((item) => item.type === 'PIX');
    if (cashMethod === undefined || pixMethod === undefined)
      throw new Error('Formas de pagamento padrão não foram provisionadas.');
    cashMethodPublicId = cashMethod.publicId;
    pixMethodPublicId = pixMethod.publicId;
  });

  afterEach(async () => {
    const ids = [tenantId, otherTenantId];
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
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

  describe('pagamentos (bloco anterior, mantido com formas de pagamento reais)', () => {
    it('registra um pagamento parcial vinculado a uma forma de pagamento real e calcula o saldo', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);

      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: pixMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );
      expect(payment.status).toBe('PAID');
      expect(payment.amountCents).toBe('10000');
      expect(payment.paymentMethodPublicId).toBe(pixMethodPublicId);
      expect(payment.paymentMethodName).toBe('Pix');

      const list = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(list.items).toHaveLength(1);
      expect(list.summary.priceCents).toBe('15000');
      expect(list.summary.totalPaidCents).toBe('10000');
      expect(list.summary.balanceCents).toBe('5000');
    });

    it('permite quitar o saldo com um segundo pagamento e impede exceder o preço do agendamento', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const second = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: pixMethodPublicId, kind: 'PAYMENT', amountCents: 5_000 },
        actor,
      );
      expect(second.amountCents).toBe('5000');

      const afterFull = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(afterFull.summary.balanceCents).toBe('0');

      await expect(
        payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 1 },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_APPOINTMENT_PRICE' });
    });

    it('impede pagamento em agendamento cancelado e isola por tenant', async () => {
      const canceled = await appointments.create(tenantId, input(start), actor);
      await appointments.status(tenantId, canceled.publicId, 'CANCELED', 'Cliente desistiu', actor);

      await expect(
        payments.create(
          tenantId,
          canceled.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 1_000 },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'PAYMENT_NOT_ALLOWED_FOR_CANCELED_APPOINTMENT' });

      const appointment = await appointments.create(
        tenantId,
        input(`${date}T16:00:00.000Z`),
        actor,
      );
      await expect(
        payments.create(
          otherTenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 1_000 },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });

      await expect(
        payments.listForAppointment(otherTenantId, appointment.publicId),
      ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    });

    it('permite cancelar um pagamento registrado por engano e reflete no saldo', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: pixMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const canceled = await payments.cancel(
        tenantId,
        appointment.publicId,
        payment.publicId,
        'Registrado por engano',
        actor,
      );
      expect(canceled.status).toBe('CANCELED');
      expect(canceled.canceledReason).toBe('Registrado por engano');

      const list = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(list.summary.totalPaidCents).toBe('0');
      expect(list.summary.balanceCents).toBe('15000');

      await expect(
        payments.cancel(tenantId, appointment.publicId, payment.publicId, 'Duplicado', actor),
      ).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_CANCELED' });

      const auditEntry = await client.auditLog.findFirst({
        where: { tenantId, action: 'payment.registered', targetPublicId: payment.publicId },
      });
      expect(auditEntry).not.toBeNull();
    });

    it('rejeita pagamento com forma de pagamento inativa ou inexistente', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      const inactive = await paymentMethods.create(tenantId, {
        name: 'Boleto',
        type: 'OTHER',
        sortOrder: 10,
        active: false,
      });

      await expect(
        payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: inactive.publicId, kind: 'PAYMENT', amountCents: 1_000 },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'PAYMENT_METHOD_INACTIVE' });

      await expect(
        payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: randomUUID(), kind: 'PAYMENT', amountCents: 1_000 },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'PAYMENT_METHOD_NOT_FOUND' });
    });
  });

  describe('formas de pagamento configuráveis pelo tenant', () => {
    it('provisiona um conjunto padrão de formas ativas na primeira consulta do tenant', async () => {
      expect(cashMethodPublicId).not.toBe('');
      expect(pixMethodPublicId).not.toBe('');
      const list = await paymentMethods.list(tenantId);
      expect(list.items.length).toBeGreaterThanOrEqual(4);
      expect(list.items.every((item) => item.active)).toBe(true);
    });

    it('cria, reordena e desativa uma forma de pagamento personalizada', async () => {
      const created = await paymentMethods.create(tenantId, {
        name: 'Vale-presente',
        type: 'OTHER',
        sortOrder: 99,
        active: true,
      });
      expect(created.name).toBe('Vale-presente');

      const updated = await paymentMethods.update(tenantId, created.publicId, {
        sortOrder: 5,
        active: false,
      });
      expect(updated.sortOrder).toBe(5);
      expect(updated.active).toBe(false);
    });

    it('impede nomes duplicados no mesmo tenant e isola por tenant (leitura e escrita)', async () => {
      await expect(
        paymentMethods.create(tenantId, {
          name: 'Dinheiro',
          type: 'CASH',
          sortOrder: 0,
          active: true,
        }),
      ).rejects.toMatchObject({ code: 'PAYMENT_METHOD_NAME_CONFLICT' });

      const ownMethod = await paymentMethods.create(tenantId, {
        name: 'Carteira digital',
        type: 'OTHER',
        sortOrder: 20,
        active: true,
      });
      await expect(
        paymentMethods.update(otherTenantId, ownMethod.publicId, { active: false }),
      ).rejects.toMatchObject({ code: 'PAYMENT_METHOD_NOT_FOUND' });

      const otherList = await paymentMethods.list(otherTenantId);
      expect(otherList.items.some((item) => item.name === 'Carteira digital')).toBe(false);
    });
  });

  describe('sinal (depósito antecipado) do agendamento', () => {
    it('calcula o valor do sinal fixo e percentual a partir do preço real do agendamento', async () => {
      const fixed = await appointments.create(
        tenantId,
        input(start, { depositType: 'FIXED', depositValue: 5_000 }),
        actor,
      );
      expect(fixed.depositType).toBe('FIXED');
      expect(fixed.depositAmountCents).toBe('5000');
      expect(fixed.depositPercentage).toBeNull();

      const percentage = await appointments.create(
        tenantId,
        input(`${date}T17:00:00.000Z`, { depositType: 'PERCENTAGE', depositValue: 30 }),
        actor,
      );
      expect(percentage.depositType).toBe('PERCENTAGE');
      expect(percentage.depositPercentage).toBe(30);
      expect(percentage.depositAmountCents).toBe('4500');
    });

    it('impede sinal negativo, zero ou acima do preço total do agendamento', async () => {
      await expect(
        appointments.create(
          tenantId,
          input(start, { depositType: 'PERCENTAGE', depositValue: 150 }),
          actor,
        ),
      ).rejects.toBeTruthy();

      await expect(
        appointments.create(
          tenantId,
          input(`${date}T18:00:00.000Z`, { depositType: 'FIXED', depositValue: 20_000 }),
          actor,
        ),
      ).rejects.toMatchObject({ code: 'DEPOSIT_AMOUNT_INVALID' });
    });

    it('registra o pagamento real do sinal e reflete no saldo restante do agendamento', async () => {
      const appointment = await appointments.create(
        tenantId,
        input(start, { depositType: 'FIXED', depositValue: 4_500 }),
        actor,
      );

      const deposit = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: pixMethodPublicId, kind: 'DEPOSIT', amountCents: 4_500 },
        actor,
      );
      expect(deposit.kind).toBe('DEPOSIT');

      const list = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(list.summary.depositAmountCents).toBe('4500');
      expect(list.summary.depositPaidCents).toBe('4500');
      expect(list.summary.totalPaidCents).toBe('4500');
      expect(list.summary.balanceCents).toBe('10500');

      const remainder = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_500 },
        actor,
      );
      expect(remainder.kind).toBe('PAYMENT');

      const settled = await payments.listForAppointment(tenantId, appointment.publicId);
      expect(settled.summary.balanceCents).toBe('0');
      expect(settled.summary.depositPaidCents).toBe('4500');

      const auditEntry = await client.auditLog.findFirst({
        where: { tenantId, action: 'payment.deposit_registered', targetPublicId: deposit.publicId },
      });
      expect(auditEntry).not.toBeNull();
    });
  });
});
