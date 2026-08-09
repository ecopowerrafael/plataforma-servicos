import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PrismaProfessionalScheduleRepository } from '../src/modules/professionals/professional-schedule.repository.js';
import { ProfessionalScheduleService } from '../src/modules/professionals/professional-schedule.service.js';
import { PrismaProfessionalUnavailabilityRepository } from '../src/modules/professionals/professional-unavailability.repository.js';
import { ProfessionalUnavailabilityService } from '../src/modules/professionals/professional-unavailability.service.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)(
  'jornada, disponibilidade e bloqueios do próprio profissional com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const professionals = new ProfessionalService(
      new PrismaProfessionalRepository(client),
      new LocalServiceImageStorage(),
    );
    const schedules = new ProfessionalScheduleService(
      new PrismaProfessionalScheduleRepository(client),
    );
    const unavailabilities = new ProfessionalUnavailabilityService(
      new PrismaProfessionalUnavailabilityRepository(client),
    );
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let roleId: bigint;
    let staffUserId: bigint;
    let adminUserId: bigint;
    const professionalInput = (userPublicId: string | null) => ({
      name: 'Profissional',
      publicName: 'Profissional',
      bio: null,
      phone: null,
      email: null,
      professionalDocument: null,
      specialties: [],
      calendarColor: '#111111',
      sortOrder: 0,
      active: true,
      primaryUnitPublicId: null,
      userPublicId,
      commissionType: 'PERCENTAGE' as const,
      commissionValue: 0,
      customFields: {},
    });
    const unavailabilityInput = (title: string) => ({
      unitPublicId: null,
      type: 'BLOCK' as const,
      title,
      reason: null,
      startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 5 * 86_400_000 + 3_600_000).toISOString(),
      allDay: false,
      repeatsWeekly: false,
      recurrenceEndsAt: null,
      active: true,
    });

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `profavail-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Teste',
          displayName: 'Teste',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
      const role = await client.role.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          code: `PROFESSIONAL_${suffix}`,
          name: 'Profissional',
          description: 'Teste',
          isSystem: false,
        },
      });
      roleId = role.id;
      const staffUser = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `profavail-${randomUUID()}@test.invalid`,
          normalizedEmail: `profavail-${randomUUID()}@test.invalid`,
          passwordHash: 'test',
          status: 'ACTIVE',
        },
      });
      staffUserId = staffUser.id;
      await client.tenantMembership.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          userId: staffUserId,
          roleId,
          status: 'ACTIVE',
          isOwner: false,
        },
      });
      const adminUser = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `profavail-admin-${randomUUID()}@test.invalid`,
          normalizedEmail: `profavail-admin-${randomUUID()}@test.invalid`,
          passwordHash: 'test',
          status: 'ACTIVE',
        },
      });
      const adminSession = await client.userSession.create({
        data: {
          publicId: randomUUID(),
          userId: adminUser.id,
          tokenHash: randomUUID().replaceAll('-', ''),
          expiresAt: new Date(Date.now() + 86_400_000),
          lastSeenAt: new Date(),
        },
      });
      adminUserId = adminUser.id;
      actor = { userId: adminUser.id, sessionId: adminSession.id };
    });

    afterEach(async () => {
      const ids = [tenantId];
      await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalUnavailability.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenantMembership.deleteMany({ where: { tenantId: { in: ids } } });
      await client.role.deleteMany({ where: { id: roleId } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
      await client.userSession.deleteMany({ where: { userId: adminUserId } });
      await client.user.deleteMany({ where: { id: { in: [staffUserId, adminUserId] } } });
    });

    it('permite ao profissional visualizar a própria jornada, isolada de outros profissionais', async () => {
      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      const linked = await professionals.create(
        tenantId,
        professionalInput(staffUser.publicId),
        actor,
      );
      const other = await professionals.create(tenantId, professionalInput(null), actor);
      const [linkedRecord, otherRecord] = await Promise.all([
        client.professional.findFirstOrThrow({ where: { publicId: linked.publicId } }),
        client.professional.findFirstOrThrow({ where: { publicId: other.publicId } }),
      ]);
      await Promise.all([
        client.professionalWorkSchedule.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            professionalId: linkedRecord.id,
            weekday: 1,
            startsAt: '09:00',
            endsAt: '18:00',
          },
        }),
        client.professionalWorkSchedule.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            professionalId: otherRecord.id,
            weekday: 2,
            startsAt: '10:00',
            endsAt: '16:00',
          },
        }),
      ]);

      const me = await professionals.me(tenantId, staffUserId);
      const ownSchedule = await schedules.list(tenantId, me.publicId);

      expect(ownSchedule.items).toHaveLength(1);
      expect(ownSchedule.items[0]).toMatchObject({ weekday: 1, startsAt: '09:00' });
    });

    it('permite ao profissional criar, editar e remover os próprios bloqueios/folgas, sem afetar outros profissionais', async () => {
      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      await professionals.create(tenantId, professionalInput(staffUser.publicId), actor);
      const other = await professionals.create(tenantId, professionalInput(null), actor);
      const me = await professionals.me(tenantId, staffUserId);

      const created = await unavailabilities.create(
        tenantId,
        me.publicId,
        unavailabilityInput('Consulta médica'),
        actor,
      );
      expect(created.items).toHaveLength(1);
      const itemPublicId = created.items[0]?.publicId;
      if (itemPublicId === undefined) throw new Error('Bloqueio não criado.');

      const updated = await unavailabilities.update(
        tenantId,
        me.publicId,
        itemPublicId,
        { ...unavailabilityInput('Consulta médica remarcada') },
        actor,
      );
      expect(updated.items[0]).toMatchObject({ title: 'Consulta médica remarcada' });

      const otherList = await unavailabilities.list(tenantId, other.publicId, {});
      expect(otherList.items).toHaveLength(0);

      await expect(
        unavailabilities.update(
          tenantId,
          other.publicId,
          itemPublicId,
          unavailabilityInput('Tentativa indevida'),
          actor,
        ),
      ).rejects.toMatchObject({ code: 'PROFESSIONAL_UNAVAILABILITY_NOT_FOUND' });
      await expect(
        unavailabilities.remove(tenantId, other.publicId, itemPublicId, actor),
      ).rejects.toMatchObject({ code: 'PROFESSIONAL_UNAVAILABILITY_NOT_FOUND' });

      const removed = await unavailabilities.remove(tenantId, me.publicId, itemPublicId, actor);
      expect(removed.items).toHaveLength(0);
    });

    it('não permite ao profissional criar bloqueio para outro profissional além de si mesmo', async () => {
      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      await professionals.create(tenantId, professionalInput(staffUser.publicId), actor);
      const other = await professionals.create(tenantId, professionalInput(null), actor);
      const me = await professionals.me(tenantId, staffUserId);

      await unavailabilities.create(tenantId, me.publicId, unavailabilityInput('Folga'), actor);

      const otherList = await unavailabilities.list(tenantId, other.publicId, {});
      expect(otherList.items).toHaveLength(0);
    });
  },
);
