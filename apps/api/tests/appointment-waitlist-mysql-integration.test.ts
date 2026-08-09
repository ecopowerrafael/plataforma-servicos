import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentWaitlistRepository } from '../src/modules/appointments/appointment-waitlist.repository.js';
import { AppointmentWaitlistService } from '../src/modules/appointments/appointment-waitlist.service.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
describe.skipIf(url === undefined)('waitlist', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const availability = new AvailabilityService(new AvailabilityRepository(client));
  const appointments = new AppointmentService(new AppointmentRepository(client), availability);
  const repository = new AppointmentWaitlistRepository(client);
  const service = new AppointmentWaitlistService(repository, appointments, availability);
  const ids: bigint[] = [];
  let tenantId: bigint,
    otherTenantId: bigint,
    customerId: bigint,
    professionalId: bigint,
    serviceId: bigint,
    unitId: bigint,
    userId: bigint,
    sessionId: bigint;
  const startsAt = new Date(Date.now() + 4 * 86_400_000);
  startsAt.setUTCHours(15, 0, 0, 0);
  beforeAll(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `${randomUUID()}@test.invalid`,
        normalizedEmail: `${randomUUID()}@test.invalid`,
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });
    userId = user.id;
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `wl-${randomUUID().slice(0, 8)}`,
        legalName: 'WL',
        displayName: 'WL',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    ids.push(tenant.id);
    const other = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `wl-${randomUUID().slice(0, 8)}`,
        legalName: 'Other',
        displayName: 'Other',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    otherTenantId = other.id;
    ids.push(other.id);
    const role = await client.role.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        code: `waitlist-${randomUUID()}`,
        name: 'Waitlist test',
        description: 'Waitlist test',
      },
    });
    await client.tenantMembership.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId,
        roleId: role.id,
        status: 'ACTIVE',
        isOwner: true,
      },
    });
    const session = await client.userSession.create({
      data: {
        publicId: randomUUID(),
        userId,
        tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        expiresAt: new Date(Date.now() + 86400000),
        lastSeenAt: new Date(),
      },
    });
    sessionId = session.id;
    const unit = await client.businessUnit.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Unidade',
        slug: 'unidade',
        timezone: 'America/Sao_Paulo',
        isHeadquarters: true,
      },
    });
    unitId = unit.id;
    const customer = await client.customer.create({
      data: { publicId: randomUUID(), tenantId, name: 'Cliente' },
    });
    customerId = customer.id;
    const professional = await client.professional.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        primaryUnitId: unitId,
        name: 'Prof',
        publicName: 'Prof',
        calendarColor: '#222222',
      },
    });
    professionalId = professional.id;
    const catalog = await client.service.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Serviço',
        durationMinutes: 45,
        priceCents: 1000n,
        color: '#222222',
      },
    });
    serviceId = catalog.id;
    await client.professionalService.create({
      data: { publicId: randomUUID(), tenantId, professionalId, serviceId },
    });
    await client.professionalWorkSchedule.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId,
        unitId,
        weekday: startsAt.getUTCDay(),
        startsAt: '09:00',
        endsAt: '18:00',
      },
    });
  });
  afterAll(async () => {
    await client.appointmentWaitlist.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointmentWaitlistOpportunity.deleteMany({ where: { tenantId: { in: ids } } });
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.businessUnit.deleteMany({ where: { tenantId: { in: ids } } });
    const memberships = await client.tenantMembership.findMany({
      where: { tenantId: { in: ids } },
      select: { roleId: true },
    });
    await client.tenantMembership.deleteMany({ where: { tenantId: { in: ids } } });
    await client.role.deleteMany({ where: { id: { in: memberships.map((x) => x.roleId) } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    await client.userSession.deleteMany({ where: { userId } });
    await client.user.delete({ where: { id: userId } });
    await client.$disconnect();
  });
  it('recusa fila quando há disponibilidade compatível e isola tenant', async () => {
    const [customer, professional, catalog, unit] = await Promise.all([
      client.customer.findUniqueOrThrow({ where: { id: customerId } }),
      client.professional.findUniqueOrThrow({ where: { id: professionalId } }),
      client.service.findUniqueOrThrow({ where: { id: serviceId } }),
      client.businessUnit.findUniqueOrThrow({ where: { id: unitId } }),
    ]);
    await expect(
      service.create(
        tenantId,
        {
          customerPublicId: customer.publicId,
          professionalPublicId: professional.publicId,
          servicePublicId: catalog.publicId,
          unitPublicId: unit.publicId,
          preferredDateFrom: startsAt.toISOString().slice(0, 10),
          preferredDateTo: startsAt.toISOString().slice(0, 10),
          preferredTimeStart: '09:00',
          preferredTimeEnd: '18:00',
          expiresAt: new Date(startsAt.getTime() + 86400000).toISOString(),
        },
        { userId, sessionId },
      ),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_WAITLIST_AVAILABILITY_EXISTS' });
    expect((await service.list(otherTenantId, {})).items).toHaveLength(0);
  });
  it('faz FIFO, claim único e impede conversão dupla', async () => {
    const released = await client.appointment.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        protocol: `WL-${randomUUID().slice(0, 8)}`,
        customerId,
        professionalId,
        serviceId,
        unitId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2700000),
        durationMinutes: 45,
        priceCents: 1000n,
        status: 'CANCELED',
      },
    });
    const base = {
      tenantId,
      customerId,
      professionalId: null,
      serviceId,
      unitId,
      preferredDateFrom: new Date(`${startsAt.toISOString().slice(0, 10)}T00:00:00Z`),
      preferredDateTo: new Date(`${startsAt.toISOString().slice(0, 10)}T00:00:00Z`),
      preferredTimeStart: '09:00',
      preferredTimeEnd: '18:00',
      expiresAt: new Date(startsAt.getTime() + 86400000),
    };
    const first = await repository.create({ publicId: randomUUID(), ...base });
    const secondCustomer = await client.customer.create({
      data: { publicId: randomUUID(), tenantId, name: 'Segundo' },
    });
    const second = await repository.create({
      publicId: randomUUID(),
      ...base,
      customerId: secondCustomer.id,
    });
    const matches = await Promise.all([
      service.matchCancellation(tenantId, released.id),
      service.matchCancellation(tenantId, released.id),
    ]);
    expect(matches.filter((x) => x !== null)).toHaveLength(1);
    expect((await service.get(tenantId, first.publicId)).status).toBe('MATCHED');
    expect((await service.get(tenantId, second.publicId)).status).toBe('WAITING');
    const matched = await service.get(tenantId, first.publicId);
    if (matched.opportunityPublicId === null) throw new Error('missing opportunity');
    const attempts = await Promise.allSettled([
      service.convert(
        tenantId,
        first.publicId,
        { opportunityPublicId: matched.opportunityPublicId },
        { userId, sessionId },
      ),
      service.convert(
        tenantId,
        first.publicId,
        { opportunityPublicId: matched.opportunityPublicId },
        { userId, sessionId },
      ),
    ]);
    expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await client.appointment.count({ where: { tenantId, source: 'WAITLIST' } })).toBe(1);
  });
});
