import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentOperationsService } from '../src/modules/appointments/appointment-operations.service.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)(
  'dashboard operacional e relatórios iniciais com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const appointments = new AppointmentService(
      new AppointmentRepository(client),
      new AvailabilityService(new AvailabilityRepository(client)),
    );
    const operations = new AppointmentOperationsService(client);
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let otherTenantId: bigint;
    let unitId: bigint;
    let unitPublicId: string;
    let professionalAId = '';
    let professionalBId = '';
    let serviceAId = '';
    let serviceBId = '';
    let customerId = '';
    let userId: bigint;
    const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

    beforeEach(async () => {
      const user = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `ops-${randomUUID()}@test.invalid`,
          normalizedEmail: `ops-${randomUUID()}@test.invalid`,
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
          slug: `ops-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `ops-other-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Outro',
          displayName: 'Outro',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
      otherTenantId = other.id;

      const unit = await client.businessUnit.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Matriz',
          slug: 'matriz',
          status: 'ACTIVE',
          timezone: 'America/Sao_Paulo',
        },
      });
      unitId = unit.id;
      unitPublicId = unit.publicId;

      const [customer, professionalA, professionalB, serviceA, serviceB] = await Promise.all([
        client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Ana Silva' } }),
        client.professional.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            primaryUnitId: unitId,
            name: 'Profissional A',
            publicName: 'Profissional A',
            calendarColor: '#111111',
          },
        }),
        client.professional.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            primaryUnitId: unitId,
            name: 'Profissional B',
            publicName: 'Profissional B',
            calendarColor: '#222222',
          },
        }),
        client.service.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            name: 'Consulta',
            durationMinutes: 30,
            hasPostServiceBreak: false,
            priceCents: 10_000n,
            color: '#333333',
          },
        }),
        client.service.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            name: 'Retorno',
            durationMinutes: 30,
            hasPostServiceBreak: false,
            priceCents: 8_000n,
            color: '#444444',
          },
        }),
      ]);
      customerId = customer.publicId;
      professionalAId = professionalA.publicId;
      professionalBId = professionalB.publicId;
      serviceAId = serviceA.publicId;
      serviceBId = serviceB.publicId;

      await Promise.all(
        [professionalA, professionalB].map((professional) =>
          client.professionalWorkSchedule.create({
            data: {
              publicId: randomUUID(),
              tenantId,
              professionalId: professional.id,
              weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
              startsAt: '08:00',
              endsAt: '20:00',
            },
          }),
        ),
      );

      const links: [typeof professionalA, typeof serviceA][] = [
        [professionalA, serviceA],
        [professionalA, serviceB],
        [professionalB, serviceA],
        [professionalB, serviceB],
      ];
      await Promise.all(
        links.map(([professional, service]) =>
          client.professionalService.create({
            data: {
              publicId: randomUUID(),
              tenantId,
              professionalId: professional.id,
              serviceId: service.id,
              priceCents: 10_000n,
              durationMinutes: 30,
              hasPostServiceBreak: false,
            },
          }),
        ),
      );
    });

    afterEach(async () => {
      const ids = [tenantId, otherTenantId];
      await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
      await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
      await client.service.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
      await client.businessUnit.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
      await client.userSession.deleteMany({ where: { userId } });
      await client.user.deleteMany({ where: { id: userId } });
    });

    it('calcula o dashboard operacional do dia com dados reais de agendamentos', async () => {
      const pending = await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: professionalAId,
          servicePublicId: serviceAId,
          unitPublicId,
          startsAt: `${date}T13:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );
      await appointments.checkIn(tenantId, pending.publicId, undefined, actor);

      const fitIn = await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: professionalBId,
          servicePublicId: serviceBId,
          unitPublicId,
          startsAt: `${date}T14:00:00.000Z`,
          source: 'INTERNAL',
          isFitIn: true,
          fitInReason: 'Encaixe urgente',
        },
        actor,
      );

      const canceled = await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: professionalAId,
          servicePublicId: serviceAId,
          startsAt: `${date}T15:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );
      await appointments.status(tenantId, canceled.publicId, 'CANCELED', 'Cliente desistiu', actor);

      const dashboard = await operations.dashboard(tenantId, date);

      expect(dashboard.date).toBe(date);
      expect(dashboard.today.total).toBe(3);
      expect(dashboard.today.byStatus.PENDING).toBe(2);
      expect(dashboard.today.byStatus.CANCELED).toBe(1);
      expect(dashboard.today.checkedIn).toBe(1);
      expect(dashboard.today.fitIn).toBe(1);
      expect(
        dashboard.today.byProfessional.find(
          (entry) => entry.professionalPublicId === professionalAId,
        )?.total,
      ).toBe(2);
      expect(
        dashboard.today.byProfessional.find(
          (entry) => entry.professionalPublicId === professionalBId,
        )?.total,
      ).toBe(1);
      const unitEntry = dashboard.today.byUnit.find((entry) => entry.unitPublicId === unitPublicId);
      expect(unitEntry?.total).toBe(2);
      const noUnitEntry = dashboard.today.byUnit.find((entry) => entry.unitPublicId === null);
      expect(noUnitEntry?.total).toBe(1);

      expect(fitIn.isFitIn).toBe(true);
    });

    it('calcula relatórios por período, status, profissional, serviço, unidade e novos clientes', async () => {
      await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: professionalAId,
          servicePublicId: serviceAId,
          unitPublicId,
          startsAt: `${date}T13:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );
      const noShow = await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: professionalBId,
          servicePublicId: serviceBId,
          unitPublicId,
          startsAt: `${date}T16:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );
      await appointments.status(tenantId, noShow.publicId, 'CONFIRMED', undefined, actor);
      await appointments.status(tenantId, noShow.publicId, 'NO_SHOW', 'Não compareceu', actor);

      const report = await operations.report(
        tenantId,
        new Date(Date.now() - 60_000).toISOString(),
        `${date}T23:59:59.000Z`,
      );

      expect(report.total).toBe(2);
      expect(report.byStatus.PENDING).toBe(1);
      expect(report.byStatus.NO_SHOW).toBe(1);
      expect(report.byProfessional).toHaveLength(2);
      expect(report.byService).toHaveLength(2);
      expect(report.byUnit).toHaveLength(1);
      expect(report.byUnit[0]?.total).toBe(2);
      expect(report.newCustomers).toBe(1);
      expect(report.noShowRate).toBeCloseTo(0.5);
      expect(report.cancellationRate).toBe(0);
    });

    it('isola dashboard e relatórios por tenant', async () => {
      await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: professionalAId,
          servicePublicId: serviceAId,
          startsAt: `${date}T13:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );

      const otherDashboard = await operations.dashboard(otherTenantId, date);
      expect(otherDashboard.today.total).toBe(0);

      const otherReport = await operations.report(
        otherTenantId,
        `${date}T00:00:00.000Z`,
        `${date}T23:59:59.000Z`,
      );
      expect(otherReport.total).toBe(0);
      expect(otherReport.newCustomers).toBe(0);
    });
  },
);
