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

describe.skipIf(url === undefined)('agendamentos do cliente autenticado com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const service = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId: bigint;
  let customerPublicId = '';
  let otherCustomerPublicId = '';
  let professionalId = '';
  let serviceId = '';
  let userId: bigint;
  const futureDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const futureStart = `${futureDate}T15:00:00.000Z`;
  const pastStart = `${pastDate}T15:00:00.000Z`;
  const input = (startsAt: string, customerPublic: string) => ({
    customerPublicId: customerPublic,
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    startsAt,
    source: 'INTERNAL' as const,
  });

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `custappt-${randomUUID()}@test.invalid`,
        normalizedEmail: `custappt-${randomUUID()}@test.invalid`,
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
        slug: `custappt-${suffix}-${randomUUID().slice(0, 4)}`,
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
        slug: `custappt-other-${suffix}-${randomUUID().slice(0, 4)}`,
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
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Cliente' } }),
      client.customer.create({
        data: { publicId: randomUUID(), tenantId, name: 'Outro Cliente' },
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
    customerId = customer.id;
    customerPublicId = customer.publicId;
    otherCustomerPublicId = otherCustomer.publicId;
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
    await Promise.all([
      client.professionalWorkSchedule.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          professionalId: professional.id,
          weekday: new Date(`${futureDate}T12:00:00Z`).getUTCDay(),
          startsAt: '09:00',
          endsAt: '18:00',
        },
      }),
      client.professionalWorkSchedule.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          professionalId: professional.id,
          weekday: new Date(`${pastDate}T12:00:00Z`).getUTCDay(),
          startsAt: '09:00',
          endsAt: '18:00',
        },
      }),
    ]);
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

  const createPastAppointment = async (customerPublicIdValue: string) => {
    const professional = await client.professional.findUniqueOrThrow({
      where: { publicId: professionalId },
    });
    const service_ = await client.service.findUniqueOrThrow({ where: { publicId: serviceId } });
    const customer = await client.customer.findUniqueOrThrow({
      where: { publicId: customerPublicIdValue },
    });
    return client.appointment.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        protocol: `AGD-TEST-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        professionalId: professional.id,
        serviceId: service_.id,
        startsAt: new Date(pastStart),
        endsAt: new Date(`${pastDate}T15:30:00.000Z`),
        durationMinutes: 30,
        priceCents: 15000n,
        status: 'COMPLETED',
      },
    });
  };

  it('lista somente próximos horários futuros do próprio cliente no tenant atual', async () => {
    const upcoming = await service.create(tenantId, input(futureStart, customerPublicId), actor);
    await createPastAppointment(customerPublicId);
    await service.create(
      tenantId,
      input(`${futureDate}T16:00:00.000Z`, otherCustomerPublicId),
      actor,
    );

    const result = await service.listUpcomingForCustomer(tenantId, customerId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      publicId: upcoming.publicId,
      protocol: upcoming.protocol,
      customerPublicId,
      professionalPublicId: professionalId,
      servicePublicId: serviceId,
      status: 'PENDING',
    });
  });

  it('lista histórico completo do cliente ordenado do mais recente ao mais antigo', async () => {
    const older = await createPastAppointment(customerPublicId);
    const newer = await service.create(tenantId, input(futureStart, customerPublicId), actor);
    await service.create(
      tenantId,
      input(`${futureDate}T16:00:00.000Z`, otherCustomerPublicId),
      actor,
    );

    const result = await service.listHistoryForCustomer(tenantId, customerId);

    expect(result.items.map((item) => item.publicId)).toEqual([newer.publicId, older.publicId]);
  });

  it('nao vaza agendamentos de outro tenant para o mesmo customerId numerico', async () => {
    const result = await service.listUpcomingForCustomer(otherTenantId, customerId);
    expect(result.items).toHaveLength(0);
  });

  it('permite que o cliente cancele o proprio agendamento, exige motivo e registra auditoria sem ator staff', async () => {
    const created = await service.create(tenantId, input(futureStart, customerPublicId), actor);

    await expect(
      service.cancelForCustomer(tenantId, customerId, created.publicId, undefined),
    ).rejects.toMatchObject({ code: 'CANCEL_REASON_REQUIRED' });

    const result = await service.cancelForCustomer(
      tenantId,
      customerId,
      created.publicId,
      'Imprevisto pessoal',
    );
    expect(result).toEqual({ success: true });

    const canceled = await service.get(tenantId, created.publicId);
    expect(canceled).toMatchObject({ status: 'CANCELED', canceledReason: 'Imprevisto pessoal' });

    const auditEntry = await client.auditLog.findFirst({
      where: { tenantId, action: 'appointment.canceled', targetPublicId: created.publicId },
    });
    expect(auditEntry).toMatchObject({ userId: null, sessionId: null });
  });

  it('impede que o cliente cancele ou reagende agendamento de outro cliente ou de outro tenant', async () => {
    const created = await service.create(
      tenantId,
      input(futureStart, otherCustomerPublicId),
      actor,
    );

    await expect(
      service.cancelForCustomer(tenantId, customerId, created.publicId, 'Motivo qualquer'),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    await expect(
      service.rescheduleForCustomer(
        tenantId,
        customerId,
        created.publicId,
        `${futureDate}T17:00:00.000Z`,
        'Motivo qualquer',
      ),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });

    const ownAppointment = await service.create(
      tenantId,
      input(`${futureDate}T17:00:00.000Z`, customerPublicId),
      actor,
    );
    await expect(
      service.cancelForCustomer(otherTenantId, customerId, ownAppointment.publicId, 'Motivo'),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('permite que o cliente reagende o proprio agendamento respeitando disponibilidade', async () => {
    const created = await service.create(tenantId, input(futureStart, customerPublicId), actor);
    const newStart = `${futureDate}T17:00:00.000Z`;

    const rescheduled = await service.rescheduleForCustomer(
      tenantId,
      customerId,
      created.publicId,
      newStart,
      'Preciso mudar o horário',
    );

    expect(rescheduled).toMatchObject({
      publicId: created.publicId,
      startsAt: newStart,
      rescheduleReason: 'Preciso mudar o horário',
      status: 'PENDING',
    });
  });

  it('bloqueia o reagendamento do cliente para um horário em conflito', async () => {
    const created = await service.create(tenantId, input(futureStart, customerPublicId), actor);
    await service.create(
      tenantId,
      { ...input(`${futureDate}T17:00:00.000Z`, otherCustomerPublicId) },
      actor,
    );

    await expect(
      service.rescheduleForCustomer(
        tenantId,
        customerId,
        created.publicId,
        `${futureDate}T17:00:00.000Z`,
        'Quero esse horário',
      ),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_SLOT_UNAVAILABLE' });
  });
});
