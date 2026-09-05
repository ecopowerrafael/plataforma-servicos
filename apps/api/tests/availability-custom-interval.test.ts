import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { PrismaServiceRepository } from '../src/modules/services/service.repository.js';
import { ServiceService } from '../src/modules/services/service.service.js';
import { PrismaProfessionalScheduleRepository } from '../src/modules/professionals/professional-schedule.repository.js';
import { ProfessionalScheduleService } from '../src/modules/professionals/professional-schedule.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

let actor = { userId: 0n, sessionId: null as bigint | null };

describe.skipIf(url === undefined)('availability com intervalo customizado 45 minutos', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const professionals = new ProfessionalService(
    new PrismaProfessionalRepository(client),
    new LocalServiceImageStorage(),
  );
  const services = new ServiceService(new PrismaServiceRepository(client));
  const schedules = new ProfessionalScheduleService(
    new PrismaProfessionalScheduleRepository(client),
  );
  const availability = new AvailabilityService(new AvailabilityRepository(client));

  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let professionalPublicId: string;
  let servicePublicId: string;
  let unitPublicId: string;

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `test-avail-${randomUUID()}@test.invalid`,
        normalizedEmail: `test-avail-${randomUUID()}@test.invalid`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    actor = { userId: user.id, sessionId: null };

    // Calcular o weekday para amanhã (0=domingo, 1=segunda, ..., 6=sábado)
    // Nota: ISO weekday é 0=segunda, 6=domingo, então convertemos
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowWeekday = tomorrow.getUTCDay(); // 0=domingo, 1=segunda, etc

    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `avail-45-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Teste Intervalo 45',
        displayName: 'Teste Intervalo 45',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;

    const unit = await client.businessUnit.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Matriz',
        slug: 'matriz',
        status: 'ACTIVE',
        isHeadquarters: true,
        timezone: 'America/Sao_Paulo',
      },
    });
    unitPublicId = unit.publicId;

    const professional = await professionals.create(tenantId, {
      name: 'Profissional Teste',
      publicName: 'Prof Teste',
      active: true,
      specialties: [],
      calendarColor: '#111111',
      sortOrder: 0,
      commissionType: 'PERCENTAGE',
      commissionValue: 0,
      customFields: {},
    }, actor);
    professionalPublicId = professional.publicId;

    const service = await services.create(tenantId, {
      name: 'Serviço 60min',
      slug: `service-60-${suffix}`,
      durationMinutes: 60,
      active: true,
      categoryId: null,
      priceCents: 10000,
      description: null,
      prepayment: null,
      prepaymentPercentage: null,
      color: '#111111',
      imageId: null,
      hasPostServiceBreak: false,
      postServiceBreakMinutes: 0,
    }, actor);
    servicePublicId = service.publicId;

    const profRecord = await client.professional.findFirstOrThrow({
      where: { publicId: professionalPublicId },
    });
    const svcRecord = await client.service.findFirstOrThrow({
      where: { publicId: servicePublicId },
    });

    await client.professionalService.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId: profRecord.id,
        serviceId: svcRecord.id,
        active: true,
      },
    });

    await schedules.create(tenantId, professionalPublicId, {
      periods: [{
        weekday: tomorrowWeekday,
        startsAt: '08:00',
        endsAt: '12:00',
      }],
    }, actor);

    await client.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        allowMultipleUnits: false,
        defaultAppointmentIntervalMinutes: 45,
        weekStartsOn: 'MONDAY',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: 'H24',
      },
      update: {
        defaultAppointmentIntervalMinutes: 45,
      },
    });
  });

  afterEach(async () => {
    const ids = [tenantId];
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalUnavailability.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.businessUnit.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenantSettings.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    if (actor.userId > 0n) {
      await client.user.deleteMany({ where: { id: actor.userId } });
    }
  });

  it('gera slots com intervalo de 45 minutos para jornada 08:00-12:00', async () => {
    const today = new Date();
    today.setUTCDate(today.getUTCDate() + 1);
    const tomorrow = today.toISOString().split('T')[0];

    const result = await availability.available(tenantId, {
      date: tomorrow,
      professionalPublicId,
      servicePublicId,
      unitPublicId,
    });

    expect(result.intervalMinutes).toBe(45);
    expect(result.blockedMinutes).toBe(60);

    const availableSlots = result.slots.filter((slot) => slot.state === 'AVAILABLE');
    expect(availableSlots.length).toBeGreaterThan(0);

    const startTimes = availableSlots.map((slot) => {
      const date = new Date(slot.startsAt);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
        2,
        '0',
      )}`;
    });

    expect(startTimes).toContain('08:00');
    expect(startTimes).toContain('08:45');
    expect(startTimes).toContain('09:30');
    expect(startTimes).toContain('10:15');
    expect(startTimes).toContain('11:00');
  });
});
