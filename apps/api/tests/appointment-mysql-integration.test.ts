import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('agendamentos com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const service = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId = '';
  let professionalId = '';
  let serviceId = '';
  let userId: bigint;
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const start = `${date}T15:00:00.000Z`;
  const input = () => ({
    customerPublicId: customerId,
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    startsAt: start,
    source: 'INTERNAL',
  });

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `appointment-${randomUUID()}@test.invalid`,
        normalizedEmail: `appointment-${randomUUID()}@test.invalid`,
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
        slug: `appt-${suffix}-${randomUUID().slice(0, 4)}`,
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
        slug: `appt-other-${suffix}-${randomUUID().slice(0, 4)}`,
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
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Cliente' } }),
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
          hasPostServiceBreak: true,
          postServiceBreakMinutes: 15,
          priceCents: 12000n,
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
        hasPostServiceBreak: true,
        postServiceBreakMinutes: 10,
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
  });

  afterEach(async () => {
    const ids = [tenantId, otherTenantId];
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
    await client.userSession.deleteMany({ where: { userId } });
    await client.user.deleteMany({ where: { id: userId } });
  });

  it('cria snapshot, registra auditoria e bloqueia conflito concorrente', async () => {
    const results = await Promise.allSettled([
      service.create(tenantId, input(), actor),
      service.create(tenantId, input(), actor),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const created = results.find((result) => result.status === 'fulfilled');
    if (created?.status !== 'fulfilled') throw new Error('Criação ausente');
    expect(created.value).toMatchObject({
      priceCents: '15000',
      durationMinutes: 30,
      postServiceBreakMinutes: 10,
    });
    expect(
      await client.auditLog.count({ where: { tenantId, action: 'appointment.created' } }),
    ).toBe(1);
  });

  it('respeita jornada, bloqueio, antecedência e vínculo profissional-serviço', async () => {
    await expect(
      service.create(tenantId, { ...input(), startsAt: `${date}T02:00:00.000Z` }, actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_SLOT_UNAVAILABLE' });
    const professional = await client.professional.findUniqueOrThrow({
      where: { publicId: professionalId },
    });
    await client.professionalUnavailability.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId: professional.id,
        type: 'BLOCK',
        title: 'Bloqueio',
        startsAt: new Date(start),
        endsAt: new Date(`${date}T16:00:00.000Z`),
      },
    });
    await expect(service.create(tenantId, input(), actor)).rejects.toMatchObject({
      code: 'APPOINTMENT_SLOT_UNAVAILABLE',
    });
    await client.professionalUnavailability.deleteMany({ where: { tenantId } });
    await client.professionalService.updateMany({ where: { tenantId }, data: { active: false } });
    await expect(service.create(tenantId, input(), actor)).rejects.toMatchObject({
      code: 'PROFESSIONAL_SERVICE_LINK_REQUIRED',
    });
  });

  it('isola tenants, exige motivo e valida transições e reagendamento', async () => {
    const created = await service.create(tenantId, input(), actor);
    await expect(service.get(otherTenantId, created.publicId)).rejects.toMatchObject({
      code: 'APPOINTMENT_NOT_FOUND',
    });
    await expect(
      service.status(tenantId, created.publicId, 'CANCELED', undefined, actor),
    ).rejects.toMatchObject({ code: 'CANCEL_REASON_REQUIRED' });
    await expect(
      service.status(tenantId, created.publicId, 'COMPLETED', undefined, actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_STATUS_TRANSITION_INVALID' });
    await service.status(tenantId, created.publicId, 'CONFIRMED', undefined, actor);
    await service.status(tenantId, created.publicId, 'IN_PROGRESS', undefined, actor);
    await service.status(tenantId, created.publicId, 'COMPLETED', undefined, actor);
    expect(
      (
        await service.list(tenantId, {
          from: `${date}T00:00:00.000Z`,
          to: `${date}T23:59:59.000Z`,
          professionalPublicId: professionalId,
        })
      ).items,
    ).toHaveLength(1);
  });

  it('respeita os limites de antecedência mínima e máxima', async () => {
    await client.tenantSettings.create({
      data: { tenantId, minimumAdvanceMinutes: 60, maximumAdvanceDays: 1 },
    });
    await expect(service.create(tenantId, input(), actor)).rejects.toMatchObject({
      code: 'AVAILABILITY_DATE_OUT_OF_RANGE',
    });
  });

  it('rejeita reagendamento que sobrepõe outro agendamento', async () => {
    await service.create(tenantId, input(), actor);
    const second = await service.create(
      tenantId,
      { ...input(), startsAt: `${date}T17:00:00.000Z` },
      actor,
    );
    await expect(
      service.update(
        tenantId,
        second.publicId,
        { ...input(), rescheduleReason: 'Ajuste de horário' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_SLOT_UNAVAILABLE' });
  });
});
