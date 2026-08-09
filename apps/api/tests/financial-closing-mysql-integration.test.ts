import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { CashRegisterService } from '../src/modules/payments/cash-register.service.js';
import { DelinquencyService } from '../src/modules/payments/delinquency.service.js';
import { FinancialClosingService } from '../src/modules/payments/financial-closing.service.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { ProfessionalCommissionService } from '../src/modules/payments/professional-commission.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)(
  'fechamento financeiro e inadimplência (Etapa 14) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const cashRegisters = new CashRegisterService(client);
    const commissions = new ProfessionalCommissionService(client);
    const financialClosings = new FinancialClosingService(client);
    const delinquency = new DelinquencyService(client);
    const appointments = new AppointmentService(
      new AppointmentRepository(client),
      new AvailabilityService(new AvailabilityRepository(client)),
    );
    const payments = new PaymentService(client, cashRegisters, commissions);
    const paymentMethods = new PaymentMethodService(client);
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let otherTenantId: bigint;
    let customerId = '';
    let professionalId = '';
    let serviceId = '';
    let userId: bigint;
    let cashMethodPublicId = '';
    const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const start = `${date}T15:00:00.000Z`;
    const input = (startsAt: string) => ({
      customerPublicId: customerId,
      professionalPublicId: professionalId,
      servicePublicId: serviceId,
      startsAt,
      source: 'INTERNAL',
    });
    const periodFrom = new Date(Date.now() - 3_600_000).toISOString();
    const periodTo = new Date(Date.now() + 3_600_000).toISOString();

    beforeEach(async () => {
      const user = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `closing-${randomUUID()}@test.invalid`,
          normalizedEmail: `closing-${randomUUID()}@test.invalid`,
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
          slug: `closing-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Salão Teste Ltda',
          displayName: 'Salão Teste',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      const other = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `closing-other-${suffix}-${randomUUID().slice(0, 4)}`,
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
            commissionType: 'PERCENTAGE',
            commissionValue: 10,
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
      if (cashMethod === undefined) throw new Error('Forma de pagamento padrão não provisionada.');
      cashMethodPublicId = cashMethod.publicId;
    });

    afterEach(async () => {
      const ids = [tenantId, otherTenantId];
      await client.financialClosing.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalCommission.deleteMany({ where: { tenantId: { in: ids } } });
      await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.cashMovement.deleteMany({ where: { tenantId: { in: ids } } });
      await client.cashRegister.deleteMany({ where: { tenantId: { in: ids } } });
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

    describe('fechamento financeiro por período', () => {
      it('consolida pagamentos recebidos, cancelados, sinais, caixa e comissões do período', async () => {
        const register = await cashRegisters.open(tenantId, { openingBalanceCents: 0 }, actor);

        const appointment = await appointments.create(
          tenantId,
          { ...input(start), depositType: 'FIXED', depositValue: 5_000 },
          actor,
        );
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'DEPOSIT', amountCents: 5_000 },
          actor,
        );
        const remainder = await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        const canceledAppointment = await appointments.create(
          tenantId,
          input(`${date}T17:00:00.000Z`),
          actor,
        );
        const canceledPayment = await payments.create(
          tenantId,
          canceledAppointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 7_000 },
          actor,
        );
        await payments.cancel(
          tenantId,
          canceledAppointment.publicId,
          canceledPayment.publicId,
          'Cliente desistiu',
          actor,
        );

        await cashRegisters.addMovement(
          tenantId,
          register.publicId,
          { direction: 'IN', amountCents: 2_000, reason: 'Venda avulsa' },
          actor,
        );
        await cashRegisters.addMovement(
          tenantId,
          register.publicId,
          { direction: 'OUT', amountCents: 1_000, reason: 'Troco' },
          actor,
        );

        const closing = await financialClosings.create(tenantId, { periodFrom, periodTo }, actor);

        expect(closing.totalReceivedCents).toBe('15000');
        expect(closing.totalCanceledCents).toBe('7000');
        expect(closing.depositTotalCents).toBe('5000');
        expect(closing.manualInCents).toBe('2000');
        expect(closing.manualOutCents).toBe('1000');
        expect(closing.cashMovementsNetCents).toBe('16000');
        expect(closing.commissionsTotalCents).toBe('1500');
        expect(closing.balanceCents).toBe('16000');
        expect(closing.status).toBe('ACTIVE');
        expect(closing.closedByEmail).not.toBeNull();
        expect(closing.paymentMethodBreakdown).toHaveLength(1);
        expect(closing.paymentMethodBreakdown[0]?.totalCents).toBe('15000');
        expect(closing.paymentMethodBreakdown[0]?.count).toBe(2);

        expect(remainder.status).toBe('PAID');
      });

      it('persiste um snapshot que não muda quando novos dados são registrados depois', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        const closing = await financialClosings.create(tenantId, { periodFrom, periodTo }, actor);
        expect(closing.totalReceivedCents).toBe('10000');

        const laterAppointment = await appointments.create(
          tenantId,
          input(`${date}T18:00:00.000Z`),
          actor,
        );
        await payments.create(
          tenantId,
          laterAppointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 9_999 },
          actor,
        );

        const reloaded = await financialClosings.get(tenantId, closing.publicId);
        expect(reloaded.totalReceivedCents).toBe('10000');
      });

      it('impede um novo fechamento sobreposto ao período de um fechamento ativo', async () => {
        await financialClosings.create(tenantId, { periodFrom, periodTo }, actor);
        await expect(
          financialClosings.create(tenantId, { periodFrom, periodTo }, actor),
        ).rejects.toMatchObject({ code: 'FINANCIAL_CLOSING_PERIOD_OVERLAPS' });
      });

      it('cancela um fechamento realizado por engano, preservando o histórico', async () => {
        const closing = await financialClosings.create(tenantId, { periodFrom, periodTo }, actor);
        const canceled = await financialClosings.cancel(
          tenantId,
          closing.publicId,
          'Realizado por engano',
          actor,
        );
        expect(canceled.status).toBe('CANCELED');
        expect(canceled.canceledReason).toBe('Realizado por engano');

        await expect(
          financialClosings.cancel(tenantId, closing.publicId, 'Duplicado', actor),
        ).rejects.toMatchObject({ code: 'FINANCIAL_CLOSING_ALREADY_CANCELED' });

        const auditEntry = await client.auditLog.findFirst({
          where: {
            tenantId,
            action: 'financial_closing.canceled',
            targetPublicId: closing.publicId,
          },
        });
        expect(auditEntry).not.toBeNull();
      });

      it('isola fechamentos por tenant', async () => {
        const closing = await financialClosings.create(tenantId, { periodFrom, periodTo }, actor);
        await expect(financialClosings.get(otherTenantId, closing.publicId)).rejects.toMatchObject({
          code: 'FINANCIAL_CLOSING_NOT_FOUND',
        });
        const otherList = await financialClosings.list(otherTenantId, {});
        expect(otherList.items).toHaveLength(0);
      });
    });

    describe('inadimplência', () => {
      it('deriva o saldo pendente de Appointment.priceCents menos pagamentos válidos', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 5_000 },
          actor,
        );

        const result = await delinquency.list(tenantId, {});
        const item = result.items.find(
          (entry) => entry.appointmentPublicId === appointment.publicId,
        );
        expect(item).toBeDefined();
        expect(item?.priceCents).toBe('15000');
        expect(item?.paidCents).toBe('5000');
        expect(item?.balanceCents).toBe('10000');
      });

      it('não considera pagamento cancelado como valor recebido', async () => {
        const appointment = await appointments.create(
          tenantId,
          input(`${date}T19:00:00.000Z`),
          actor,
        );
        const payment = await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15_000 },
          actor,
        );
        await payments.cancel(tenantId, appointment.publicId, payment.publicId, 'Estorno', actor);

        const result = await delinquency.list(tenantId, {});
        const item = result.items.find(
          (entry) => entry.appointmentPublicId === appointment.publicId,
        );
        expect(item).toBeDefined();
        expect(item?.paidCents).toBe('0');
        expect(item?.balanceCents).toBe('15000');
      });

      it('não lista agendamentos totalmente pagos nem agendamentos cancelados', async () => {
        const paidAppointment = await appointments.create(
          tenantId,
          input(`${date}T12:00:00.000Z`),
          actor,
        );
        await payments.create(
          tenantId,
          paidAppointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 15_000 },
          actor,
        );

        const canceledAppointment = await appointments.create(
          tenantId,
          input(`${date}T13:00:00.000Z`),
          actor,
        );
        await appointments.status(
          tenantId,
          canceledAppointment.publicId,
          'CANCELED',
          'Cliente desistiu',
          actor,
        );

        const result = await delinquency.list(tenantId, {});
        expect(
          result.items.some((entry) => entry.appointmentPublicId === paidAppointment.publicId),
        ).toBe(false);
        expect(
          result.items.some((entry) => entry.appointmentPublicId === canceledAppointment.publicId),
        ).toBe(false);
      });

      it('filtra por período, cliente e status, e isola por tenant', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);

        const matchByCustomer = await delinquency.list(tenantId, {
          customerPublicId: customerId,
        });
        expect(
          matchByCustomer.items.some((entry) => entry.appointmentPublicId === appointment.publicId),
        ).toBe(true);

        const matchByStatus = await delinquency.list(tenantId, { status: 'PENDING' });
        expect(
          matchByStatus.items.some((entry) => entry.appointmentPublicId === appointment.publicId),
        ).toBe(true);

        const noMatchByStatus = await delinquency.list(tenantId, { status: 'COMPLETED' });
        expect(
          noMatchByStatus.items.some((entry) => entry.appointmentPublicId === appointment.publicId),
        ).toBe(false);

        const otherTenantResult = await delinquency.list(otherTenantId, {});
        expect(otherTenantResult.items).toHaveLength(0);
      });
    });
  },
);
