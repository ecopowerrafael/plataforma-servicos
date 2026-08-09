import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AppointmentWaitlistService } from '../src/modules/appointments/appointment-waitlist.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('lista de espera do agendamento', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const appointmentService = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const waitlistService = new AppointmentWaitlistService(client, appointmentService);
  const suffix = randomUUID().slice(0, 8);

  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId: string;
  let professionalId: string;
  let serviceId: string;
  let userId: bigint;

  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const preferredStartsAt = `${date}T15:00:00.000Z`;

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `waitlist-${randomUUID()}@test.invalid`,
        normalizedEmail: `waitlist-${randomUUID()}@test.invalid`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    userId = user.id;

    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `waitlist-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Teste Waitlist',
        displayName: 'Teste Waitlist',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    const other = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `waitlist-other-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Outro Waitlist',
        displayName: 'Outro Waitlist',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const [customer, professional, catalog] = await Promise.all([
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Cliente Fila' } }),
      client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Profissional Fila',
          publicName: 'Profissional Fila',
          calendarColor: '#222222',
        },
      }),
      client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Consulta Fila',
          durationMinutes: 45,
          priceCents: 12000n,
          color: '#222222',
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
        durationMinutes: 45,
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
  }, 30_000);

  afterEach(async () => {
    if (tenantId === undefined || otherTenantId === undefined) return;
    const ids = [tenantId, otherTenantId];
    await client.appointmentWaitlist.deleteMany({ where: { tenantId: { in: ids } } });
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalUnavailability.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenantSettings.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    await client.user.deleteMany({ where: { id: userId } });
  });

  it('marca oportunidade sem criar Appointment automaticamente', async () => {
    const entry = await waitlistService.create(tenantId, {
      customerPublicId: customerId,
      professionalPublicId: professionalId,
      servicePublicId: serviceId,
      preferredStartsAt,
      notes: 'Quero a próxima vaga',
    });

    const matched = await waitlistService.recordOpportunity(tenantId, entry.publicId, {
      preferredStartsAt,
      reason: 'Vaga livre na agenda',
    });

    expect(matched.status).toBe('MATCHED');
    expect(await client.appointment.count({ where: { tenantId } })).toBe(0);
  });

  it('converte apenas uma tentativa concorrente em agendamento', async () => {
    const entry = await waitlistService.create(tenantId, {
      customerPublicId: customerId,
      professionalPublicId: professionalId,
      servicePublicId: serviceId,
      preferredStartsAt,
      notes: 'Quero vaga imediata',
    });
    const matched = await waitlistService.recordOpportunity(tenantId, entry.publicId, {
      preferredStartsAt,
      reason: 'Vaga aberta',
    });

    const results = await Promise.allSettled([
      waitlistService.convertToAppointment(tenantId, matched.publicId, {
        customerPublicId: customerId,
        professionalPublicId: professionalId,
        servicePublicId: serviceId,
        startsAt: preferredStartsAt,
        notes: 'Convertida da fila',
      }),
      waitlistService.convertToAppointment(tenantId, matched.publicId, {
        customerPublicId: customerId,
        professionalPublicId: professionalId,
        servicePublicId: serviceId,
        startsAt: preferredStartsAt,
        notes: 'Convertida da fila duplicada',
      }),
    ]);

    const successes = results.filter((result) => result.status === 'fulfilled');
    expect(successes).toHaveLength(1);
    expect(await client.appointment.count({ where: { tenantId } })).toBe(1);
  });
});
