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

describe.skipIf(url === undefined)('recepção e check-in de agendamentos com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const service = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId = '';
  let otherCustomerId = '';
  let professionalId = '';
  let serviceId = '';
  let userId: bigint;
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const start = `${date}T15:00:00.000Z`;
  const input = (customerPublicId: string, startsAt: string) => ({
    customerPublicId,
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    startsAt,
    source: 'INTERNAL',
  });

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `checkin-${randomUUID()}@test.invalid`,
        normalizedEmail: `checkin-${randomUUID()}@test.invalid`,
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
        slug: `checkin-${suffix}-${randomUUID().slice(0, 4)}`,
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
        slug: `checkin-other-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Outro',
        displayName: 'Outro',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;
    const [customer, otherCustomer, professional, catalog] = await Promise.all([
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Ana Silva' } }),
      client.customer.create({
        data: { publicId: randomUUID(), tenantId, name: 'Bruno Souza' },
      }),
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
    otherCustomerId = otherCustomer.publicId;
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
    await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    await client.userSession.deleteMany({ where: { userId } });
    await client.user.deleteMany({ where: { id: userId } });
  });

  it('registra o check-in com o horário real de chegada e audita a ação', async () => {
    const created = await service.create(tenantId, input(customerId, start), actor);
    expect(created.checkedInAt).toBeNull();

    const arrivalTime = new Date(`${date}T14:55:00.000Z`).toISOString();
    const checkedIn = await service.checkIn(tenantId, created.publicId, arrivalTime, actor);

    expect(checkedIn.checkedInAt).toBe(arrivalTime);
    expect(checkedIn.status).toBe('PENDING');

    const history = await service.history(tenantId, created.publicId);
    expect(history.items.map((entry) => entry.action)).toContain('CHECKED_IN');

    const auditEntry = await client.auditLog.findFirst({
      where: { tenantId, action: 'appointment.checked_in', targetPublicId: created.publicId },
    });
    expect(auditEntry).not.toBeNull();
  });

  it('usa o horário atual quando nenhum horário de chegada é informado', async () => {
    const created = await service.create(tenantId, input(customerId, start), actor);
    const before = Date.now();
    const checkedIn = await service.checkIn(tenantId, created.publicId, undefined, actor);
    const after = Date.now();

    expect(checkedIn.checkedInAt).not.toBeNull();
    const checkedInMs = new Date(checkedIn.checkedInAt ?? '').getTime();
    expect(checkedInMs).toBeGreaterThanOrEqual(before);
    expect(checkedInMs).toBeLessThanOrEqual(after);
  });

  it('impede check-in de agendamento cancelado, concluído ou inexistente', async () => {
    const canceled = await service.create(tenantId, input(customerId, start), actor);
    await service.status(tenantId, canceled.publicId, 'CANCELED', 'Motivo qualquer', actor);
    await expect(
      service.checkIn(tenantId, canceled.publicId, undefined, actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_CHECKIN_NOT_ALLOWED' });

    const completed = await service.create(
      tenantId,
      input(customerId, `${date}T16:00:00.000Z`),
      actor,
    );
    await service.status(tenantId, completed.publicId, 'CONFIRMED', undefined, actor);
    await service.status(tenantId, completed.publicId, 'IN_PROGRESS', undefined, actor);
    await service.status(tenantId, completed.publicId, 'COMPLETED', undefined, actor);
    await expect(
      service.checkIn(tenantId, completed.publicId, undefined, actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_CHECKIN_NOT_ALLOWED' });

    await expect(service.checkIn(tenantId, randomUUID(), undefined, actor)).rejects.toMatchObject({
      code: 'APPOINTMENT_NOT_FOUND',
    });
  });

  it('impede check-in duplicado e isola por tenant', async () => {
    const created = await service.create(tenantId, input(customerId, start), actor);
    await service.checkIn(tenantId, created.publicId, undefined, actor);

    await expect(
      service.checkIn(tenantId, created.publicId, undefined, actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_ALREADY_CHECKED_IN' });

    await expect(
      service.checkIn(otherTenantId, created.publicId, undefined, actor),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('permite filtrar a visão de recepção por unidade, profissional, status e buscar por cliente/protocolo', async () => {
    const first = await service.create(tenantId, input(customerId, start), actor);
    const second = await service.create(
      tenantId,
      input(otherCustomerId, `${date}T16:00:00.000Z`),
      actor,
    );

    const byCustomerSearch = await service.list(tenantId, {
      from: `${date}T00:00:00.000Z`,
      to: `${date}T23:59:59.000Z`,
      search: 'Ana Silva',
    });
    expect(byCustomerSearch.items.map((item) => item.publicId)).toEqual([first.publicId]);

    const byProtocolSearch = await service.list(tenantId, {
      from: `${date}T00:00:00.000Z`,
      to: `${date}T23:59:59.000Z`,
      search: second.protocol,
    });
    expect(byProtocolSearch.items.map((item) => item.publicId)).toEqual([second.publicId]);

    const byProfessional = await service.list(tenantId, {
      from: `${date}T00:00:00.000Z`,
      to: `${date}T23:59:59.000Z`,
      professionalPublicId: professionalId,
    });
    expect(byProfessional.items).toHaveLength(2);

    const byStatus = await service.list(tenantId, {
      from: `${date}T00:00:00.000Z`,
      to: `${date}T23:59:59.000Z`,
      status: 'PENDING',
    });
    expect(byStatus.items).toHaveLength(2);
  });
});
