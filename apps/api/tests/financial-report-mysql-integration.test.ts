import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { DelinquencyService } from '../src/modules/payments/delinquency.service.js';
import { FinancialReportService } from '../src/modules/payments/financial-report.service.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { ProfessionalCommissionService } from '../src/modules/payments/professional-commission.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)(
  'relatórios financeiros completos (Etapa 14) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const commissions = new ProfessionalCommissionService(client);
    const delinquency = new DelinquencyService(client);
    const financialReports = new FinancialReportService(client, delinquency);
    const appointments = new AppointmentService(
      new AppointmentRepository(client),
      new AvailabilityService(new AvailabilityRepository(client)),
    );
    const payments = new PaymentService(client, undefined, commissions);
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
    const from = new Date(Date.now() - 3_600_000).toISOString();
    const to = new Date(Date.now() + 3_600_000).toISOString();

    beforeEach(async () => {
      const user = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `report-${randomUUID()}@test.invalid`,
          normalizedEmail: `report-${randomUUID()}@test.invalid`,
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
          slug: `report-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `report-other-${suffix}-${randomUUID().slice(0, 4)}`,
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
      await client.professionalCommission.deleteMany({ where: { tenantId: { in: ids } } });
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

    it('calcula receita bruta/líquida, pagamentos, sinais, comissões e breakdowns a partir de dados reais', async () => {
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
      await payments.create(
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

      const report = await financialReports.get(tenantId, { from, to, compareWithPrevious: false });

      expect(report.summary.grossRevenueCents).toBe('15000');
      expect(report.summary.paymentsReceivedCount).toBe(2);
      expect(report.summary.paymentsCanceledCents).toBe('7000');
      expect(report.summary.paymentsCanceledCount).toBe(1);
      expect(report.summary.depositsCents).toBe('5000');
      expect(report.summary.depositsCount).toBe(1);
      expect(report.summary.commissionsCents).toBe('1500');
      expect(report.summary.netRevenueCents).toBe('13500');

      expect(report.byPaymentMethod).toHaveLength(1);
      expect(report.byPaymentMethod[0]?.totalCents).toBe('15000');
      expect(report.byPaymentMethod[0]?.count).toBe(2);
      expect(report.byService).toHaveLength(1);
      expect(report.byService[0]?.totalCents).toBe('15000');
      expect(report.byProfessional).toHaveLength(1);
      expect(report.byProfessional[0]?.totalCents).toBe('15000');
      expect(report.comparison).toBeNull();
    });

    it('reflete saldo pendente (inadimplência) e cancelamentos/faltas com impacto financeiro', async () => {
      const pendingAppointment = await appointments.create(tenantId, input(start), actor);
      await payments.create(
        tenantId,
        pendingAppointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 5_000 },
        actor,
      );

      const canceledAppointment = await appointments.create(
        tenantId,
        input(`${date}T17:00:00.000Z`),
        actor,
      );
      await appointments.status(
        tenantId,
        canceledAppointment.publicId,
        'CANCELED',
        'Cliente desistiu',
        actor,
      );

      const report = await financialReports.get(tenantId, { from, to, compareWithPrevious: false });

      expect(report.summary.pendingBalanceCents).toBe('10000');
      expect(report.summary.pendingBalanceCount).toBe(1);
      expect(report.summary.canceledAppointmentsCount).toBe(1);
      expect(report.summary.canceledAppointmentsLostRevenueCents).toBe('15000');
      expect(report.summary.noShowAppointmentsCount).toBe(0);
    });

    it('filtra por unidade e por profissional quando informados', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const byProfessional = await financialReports.get(tenantId, {
        from,
        to,
        professionalPublicId: professionalId,
        compareWithPrevious: false,
      });
      expect(byProfessional.summary.grossRevenueCents).toBe('10000');

      const otherProfessional = await client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Outro',
          publicName: 'Outro',
          calendarColor: '#222222',
        },
      });
      const byOtherProfessional = await financialReports.get(tenantId, {
        from,
        to,
        professionalPublicId: otherProfessional.publicId,
        compareWithPrevious: false,
      });
      expect(byOtherProfessional.summary.grossRevenueCents).toBe('0');
    });

    it('compara com o período anterior usando dados reais', async () => {
      const durationMs = new Date(to).getTime() - new Date(from).getTime();
      const previousStart = new Date(new Date(from).getTime() - durationMs / 2).toISOString();

      const previousAppointment = await appointments.create(
        tenantId,
        input(`${date}T13:00:00.000Z`),
        actor,
      );
      await payments.create(
        tenantId,
        previousAppointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 5_000 },
        actor,
      );
      await client.payment.updateMany({
        where: { tenantId },
        data: { createdAt: previousStart },
      });

      const currentAppointment = await appointments.create(tenantId, input(start), actor);
      await payments.create(
        tenantId,
        currentAppointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const report = await financialReports.get(tenantId, {
        from,
        to,
        compareWithPrevious: true,
      });
      expect(report.summary.grossRevenueCents).toBe('10000');
      expect(report.comparison).not.toBeNull();
      expect(report.comparison?.previous.grossRevenueCents).toBe('5000');
      expect(report.comparison?.deltaGrossRevenueCents).toBe('5000');
      expect(report.comparison?.deltaGrossRevenuePercent).toBe(100);
    });

    it('exporta CSV com as principais seções do relatório', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const report = await financialReports.get(tenantId, { from, to, compareWithPrevious: false });
      const csv = financialReports.toCsv(report);
      expect(csv).toContain('Relatório financeiro');
      expect(csv).toContain('Receita bruta,100.00');
      expect(csv).toContain('Receita por forma de pagamento');
      expect(csv).toContain('Dinheiro,100.00,1');
    });

    it('isola relatórios por tenant', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const otherReport = await financialReports.get(otherTenantId, {
        from,
        to,
        compareWithPrevious: false,
      });
      expect(otherReport.summary.grossRevenueCents).toBe('0');
      expect(otherReport.byPaymentMethod).toHaveLength(0);
    });
  },
);
