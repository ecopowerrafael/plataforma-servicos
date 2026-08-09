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
import { ProfessionalCommissionService } from '../src/modules/payments/professional-commission.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)(
  'comissões vinculadas a pagamentos reais (Etapa 14) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const commissions = new ProfessionalCommissionService(client);
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
    let professionalInternalId: bigint;
    let serviceId = '';
    let serviceInternalId: bigint;
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

    beforeEach(async () => {
      const user = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `commission-${randomUUID()}@test.invalid`,
          normalizedEmail: `commission-${randomUUID()}@test.invalid`,
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
          slug: `commission-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `commission-other-${suffix}-${randomUUID().slice(0, 4)}`,
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
      professionalInternalId = professional.id;
      serviceId = catalog.publicId;
      serviceInternalId = catalog.id;
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

    describe('cálculo da comissão efetiva a partir do pagamento real', () => {
      it('usa a comissão padrão do profissional (percentual) quando não há override no vínculo', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        const payment = await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        const list = await commissions.listForProfessional(tenantId, professionalInternalId);
        expect(list.items).toHaveLength(1);
        const record = list.items[0];
        expect(record?.paymentPublicId).toBe(payment.publicId);
        expect(record?.ruleSource).toBe('DEFAULT');
        expect(record?.commissionType).toBe('PERCENTAGE');
        expect(record?.commissionValue).toBe(10);
        expect(record?.baseAmountCents).toBe('10000');
        expect(record?.commissionAmountCents).toBe('1000');
        expect(record?.status).toBe('ACTIVE');
      });

      it('usa o override do vínculo profissional-serviço (valor fixo) quando existir', async () => {
        await client.professionalService.update({
          where: {
            professionalId_serviceId: {
              professionalId: professionalInternalId,
              serviceId: serviceInternalId,
            },
          },
          data: { commissionType: 'FIXED', commissionValue: 2_000 },
        });

        const appointment = await appointments.create(tenantId, input(start), actor);
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        const list = await commissions.listForProfessional(tenantId, professionalInternalId);
        const record = list.items[0];
        expect(record?.ruleSource).toBe('OVERRIDE');
        expect(record?.commissionType).toBe('FIXED');
        expect(record?.commissionValue).toBe(2_000);
        expect(record?.commissionAmountCents).toBe('2000');
      });

      it('registra uma comissão por pagamento real, inclusive para sinal', async () => {
        const appointment = await appointments.create(
          tenantId,
          { ...input(start), depositType: 'PERCENTAGE', depositValue: 30 },
          actor,
        );
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'DEPOSIT', amountCents: 4_500 },
          actor,
        );
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_500 },
          actor,
        );

        const list = await commissions.listForProfessional(tenantId, professionalInternalId);
        expect(list.items).toHaveLength(2);
        const total = list.items.reduce((sum, item) => sum + Number(item.commissionAmountCents), 0);
        expect(total).toBe(1_500);
      });
    });

    describe('snapshot da regra e imutabilidade histórica', () => {
      it('não recalcula comissões já geradas quando a regra do profissional muda depois', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        await client.professional.update({
          where: { id: professionalInternalId },
          data: { commissionType: 'PERCENTAGE', commissionValue: 50 },
        });

        const list = await commissions.listForProfessional(tenantId, professionalInternalId);
        expect(list.items[0]?.commissionValue).toBe(10);
        expect(list.items[0]?.commissionAmountCents).toBe('1000');
      });
    });

    describe('cancelamento/estorno de comissão ao cancelar o pagamento', () => {
      it('estorna a comissão quando o pagamento correspondente é cancelado', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        const payment = await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        await payments.cancel(
          tenantId,
          appointment.publicId,
          payment.publicId,
          'Pagamento duplicado',
          actor,
        );

        const list = await commissions.listForProfessional(tenantId, professionalInternalId);
        expect(list.items[0]?.status).toBe('CANCELED');
        expect(list.items[0]?.canceledReason).not.toBeNull();

        const auditEntry = await client.auditLog.findFirst({
          where: { tenantId, action: 'commission.canceled' },
        });
        expect(auditEntry).not.toBeNull();
      });
    });

    describe('consulta administrativa e isolamento', () => {
      it('lista comissões geradas com filtro por profissional e isola por tenant', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        const all = await commissions.list(tenantId, {});
        expect(all.items).toHaveLength(1);

        const filtered = await commissions.list(tenantId, { professionalPublicId: professionalId });
        expect(filtered.items).toHaveLength(1);

        const otherTenantList = await commissions.list(otherTenantId, {});
        expect(otherTenantList.items).toHaveLength(0);
      });

      it('permite ao profissional consultar somente as próprias comissões', async () => {
        const otherProfessional = await client.professional.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            name: 'Outro Profissional',
            publicName: 'Outro Profissional',
            calendarColor: '#222222',
            commissionType: 'PERCENTAGE',
            commissionValue: 20,
          },
        });

        const appointment = await appointments.create(tenantId, input(start), actor);
        await payments.create(
          tenantId,
          appointment.publicId,
          { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
          actor,
        );

        const ownList = await commissions.listForProfessional(tenantId, professionalInternalId);
        expect(ownList.items).toHaveLength(1);

        const otherList = await commissions.listForProfessional(tenantId, otherProfessional.id);
        expect(otherList.items).toHaveLength(0);
      });
    });
  },
);
