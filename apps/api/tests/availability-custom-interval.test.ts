import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { PrismaTenantRepository } from '../src/modules/tenants/tenant.repository.js';
import { TenantService } from '../src/modules/tenants/tenant.service.js';
import { PrismaServiceRepository } from '../src/modules/services/service.repository.js';
import { ServiceService } from '../src/modules/services/service.service.js';
import { PrismaProfessionalScheduleRepository } from '../src/modules/professionals/professional-schedule.repository.js';
import { ProfessionalScheduleService } from '../src/modules/professionals/professional-schedule.service.js';
import { PrismaAvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
const actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('availability com intervalo customizado 45 minutos', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const tenants = new TenantService(new PrismaTenantRepository(client));
  const professionals = new ProfessionalService(
    new PrismaProfessionalRepository(client),
    new LocalServiceImageStorage(),
  );
  const services = new ServiceService(new PrismaServiceRepository(client));
  const schedules = new ProfessionalScheduleService(
    new PrismaProfessionalScheduleRepository(client),
  );
  const availability = new AvailabilityService(new PrismaAvailabilityRepository(client));

  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let tenantPublicId: string;
  let professionalPublicId: string;
  let servicePublicId: string;
  let unitPublicId: string;

  beforeEach(async () => {
    const tenantResult = await tenants.createTenant({
      legalName: 'Teste Intervalo 45',
      displayName: 'Teste Intervalo 45',
      slug: `avail-45-${suffix}`,
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      initialUnit: { name: 'Matriz', slug: 'matriz' },
    });

    tenantPublicId = tenantResult.tenant.publicId;
    tenantId = (await client.tenant.findFirstOrThrow({
      where: { publicId: tenantPublicId },
    })).id;

    unitPublicId = tenantResult.initialUnit.publicId;

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
      value: 100,
      description: null,
      prepayment: null,
      prepaymentPercentage: null,
      color: '#111111',
      imageId: null,
      hasPostServiceBreak: false,
      postServiceBreakMinutes: 0,
    }, actor);

    servicePublicId = service.publicId;

    await client.professionalService.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId: (await client.professional.findFirstOrThrow({
          where: { publicId: professionalPublicId },
        })).id,
        serviceId: (await client.service.findFirstOrThrow({
          where: { publicId: servicePublicId },
        })).id,
        active: true,
      },
    });

    await schedules.create(tenantId, professionalPublicId, {
      weekday: 3,
      startsAt: '08:00',
      endsAt: '12:00',
    }, actor);

    await client.tenantSettings.update({
      where: { tenantId },
      data: {
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
