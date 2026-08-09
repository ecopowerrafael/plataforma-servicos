import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)(
  'painel do profissional (vínculo e agenda) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const professionals = new ProfessionalService(
      new PrismaProfessionalRepository(client),
      new LocalServiceImageStorage(),
    );
    const appointments = new AppointmentService(
      new AppointmentRepository(client),
      new AvailabilityService(new AvailabilityRepository(client)),
    );
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let otherTenantId: bigint;
    let roleId: bigint;
    let staffUserId: bigint;
    let adminUserId: bigint;
    let serviceId = '';
    let customerId = '';
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

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `profself-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `profself-other-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Outro',
          displayName: 'Outro',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
      otherTenantId = other.id;
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
          email: `professional-${randomUUID()}@test.invalid`,
          normalizedEmail: `professional-${randomUUID()}@test.invalid`,
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
          email: `professional-admin-${randomUUID()}@test.invalid`,
          normalizedEmail: `professional-admin-${randomUUID()}@test.invalid`,
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
      const [service, customer] = await Promise.all([
        client.service.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            name: 'Consulta',
            durationMinutes: 30,
            priceCents: 10000n,
            color: '#111111',
          },
        }),
        client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Cliente' } }),
      ]);
      serviceId = service.publicId;
      customerId = customer.publicId;
    });

    afterEach(async () => {
      const ids = [tenantId, otherTenantId];
      await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
      await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
      await client.service.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenantMembership.deleteMany({ where: { tenantId: { in: ids } } });
      await client.role.deleteMany({ where: { id: roleId } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
      await client.userSession.deleteMany({ where: { userId: adminUserId } });
      await client.user.deleteMany({ where: { id: { in: [staffUserId, adminUserId] } } });
    });

    it('vincula um usuário do estabelecimento a um profissional e resolve o próprio perfil', async () => {
      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      const created = await professionals.create(
        tenantId,
        professionalInput(staffUser.publicId),
        actor,
      );
      expect(created.userPublicId).toBe(staffUser.publicId);

      const me = await professionals.me(tenantId, staffUserId);
      expect(me.publicId).toBe(created.publicId);
    });

    it('recusa vincular um usuário que não pertence ao tenant e impede vínculo duplicado', async () => {
      await expect(
        professionals.create(tenantId, professionalInput(randomUUID()), actor),
      ).rejects.toMatchObject({ code: 'PROFESSIONAL_USER_NOT_FOUND' });

      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      await professionals.create(tenantId, professionalInput(staffUser.publicId), actor);
      await expect(
        professionals.create(tenantId, professionalInput(staffUser.publicId), actor),
      ).rejects.toMatchObject({ code: 'PROFESSIONAL_USER_ALREADY_LINKED' });
    });

    it('retorna PROFESSIONAL_ACCOUNT_NOT_LINKED quando o usuário não está vinculado, isolado por tenant', async () => {
      await expect(professionals.me(tenantId, staffUserId)).rejects.toMatchObject({
        code: 'PROFESSIONAL_ACCOUNT_NOT_LINKED',
      });

      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      await professionals.create(tenantId, professionalInput(staffUser.publicId), actor);
      await expect(professionals.me(otherTenantId, staffUserId)).rejects.toMatchObject({
        code: 'PROFESSIONAL_ACCOUNT_NOT_LINKED',
      });
    });

    it('lista na agenda somente os agendamentos do profissional vinculado à conta autenticada', async () => {
      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      const linked = await professionals.create(
        tenantId,
        professionalInput(staffUser.publicId),
        actor,
      );
      const other = await professionals.create(tenantId, professionalInput(null), actor);
      await Promise.all([
        client.professionalService.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            professionalId: (
              await client.professional.findFirstOrThrow({ where: { publicId: linked.publicId } })
            ).id,
            serviceId: (await client.service.findFirstOrThrow({ where: { publicId: serviceId } }))
              .id,
          },
        }),
        client.professionalService.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            professionalId: (
              await client.professional.findFirstOrThrow({ where: { publicId: other.publicId } })
            ).id,
            serviceId: (await client.service.findFirstOrThrow({ where: { publicId: serviceId } }))
              .id,
          },
        }),
      ]);
      const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const professionalRecord = await client.professional.findFirstOrThrow({
        where: { publicId: linked.publicId },
      });
      const otherRecord = await client.professional.findFirstOrThrow({
        where: { publicId: other.publicId },
      });
      await Promise.all(
        [professionalRecord.id, otherRecord.id].map((professionalId) =>
          client.professionalWorkSchedule.create({
            data: {
              publicId: randomUUID(),
              tenantId,
              professionalId,
              weekday,
              startsAt: '09:00',
              endsAt: '18:00',
            },
          }),
        ),
      );
      await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: linked.publicId,
          servicePublicId: serviceId,
          startsAt: `${date}T15:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );
      await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: other.publicId,
          servicePublicId: serviceId,
          startsAt: `${date}T16:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );

      const me = await professionals.me(tenantId, staffUserId);
      const result = await appointments.list(tenantId, {
        from: `${date}T00:00:00.000Z`,
        to: `${date}T23:59:59.000Z`,
        professionalPublicId: me.publicId,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ professionalPublicId: linked.publicId });
    });

    const setUpLinkedProfessionalWithAppointment = async () => {
      const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
      const linked = await professionals.create(
        tenantId,
        professionalInput(staffUser.publicId),
        actor,
      );
      const other = await professionals.create(tenantId, professionalInput(null), actor);
      const [linkedRecord, otherRecord, serviceRecord] = await Promise.all([
        client.professional.findFirstOrThrow({ where: { publicId: linked.publicId } }),
        client.professional.findFirstOrThrow({ where: { publicId: other.publicId } }),
        client.service.findFirstOrThrow({ where: { publicId: serviceId } }),
      ]);
      await Promise.all([
        client.professionalService.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            professionalId: linkedRecord.id,
            serviceId: serviceRecord.id,
          },
        }),
        client.professionalService.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            professionalId: otherRecord.id,
            serviceId: serviceRecord.id,
          },
        }),
      ]);
      const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      await Promise.all(
        [linkedRecord.id, otherRecord.id].map((professionalId) =>
          client.professionalWorkSchedule.create({
            data: {
              publicId: randomUUID(),
              tenantId,
              professionalId,
              weekday,
              startsAt: '09:00',
              endsAt: '18:00',
            },
          }),
        ),
      );
      const linkedAppointment = await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: linked.publicId,
          servicePublicId: serviceId,
          startsAt: `${date}T15:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );
      const otherAppointment = await appointments.create(
        tenantId,
        {
          customerPublicId: customerId,
          professionalPublicId: other.publicId,
          servicePublicId: serviceId,
          startsAt: `${date}T16:00:00.000Z`,
          source: 'INTERNAL',
        },
        actor,
      );
      const professionalId = await professionals.myId(tenantId, staffUserId);
      return { professionalId, linkedAppointment, otherAppointment };
    };

    it('permite consultar detalhes e histórico do próprio atendimento, isolado por profissional', async () => {
      const { professionalId, linkedAppointment, otherAppointment } =
        await setUpLinkedProfessionalWithAppointment();

      const detail = await appointments.getForProfessional(
        tenantId,
        professionalId,
        linkedAppointment.publicId,
      );
      expect(detail.publicId).toBe(linkedAppointment.publicId);

      const history = await appointments.historyForProfessional(
        tenantId,
        professionalId,
        linkedAppointment.publicId,
      );
      expect(history.items.map((item) => item.action)).toEqual(['CREATED']);

      await expect(
        appointments.getForProfessional(tenantId, professionalId, otherAppointment.publicId),
      ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
      await expect(
        appointments.historyForProfessional(tenantId, professionalId, otherAppointment.publicId),
      ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    });

    it('permite registrar observações apenas no próprio atendimento e audita a alteração', async () => {
      const { professionalId, linkedAppointment, otherAppointment } =
        await setUpLinkedProfessionalWithAppointment();

      const updated = await appointments.notesForProfessional(
        tenantId,
        professionalId,
        linkedAppointment.publicId,
        'Cliente pediu para reduzir o tempo de secagem.',
        actor,
      );
      expect(updated.notes).toBe('Cliente pediu para reduzir o tempo de secagem.');

      await expect(
        appointments.notesForProfessional(
          tenantId,
          professionalId,
          otherAppointment.publicId,
          'Não deveria funcionar.',
          actor,
        ),
      ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });

      const auditEntry = await client.auditLog.findFirst({
        where: {
          tenantId,
          action: 'appointment.notes_updated',
          targetPublicId: linkedAppointment.publicId,
        },
      });
      expect(auditEntry).not.toBeNull();
    });

    it('permite apenas as transições de status seguras para o profissional e nega as demais', async () => {
      const { professionalId, linkedAppointment, otherAppointment } =
        await setUpLinkedProfessionalWithAppointment();

      await expect(
        appointments.statusForProfessional(
          tenantId,
          professionalId,
          linkedAppointment.publicId,
          'IN_PROGRESS',
          undefined,
          actor,
        ),
      ).rejects.toMatchObject({
        code: 'APPOINTMENT_STATUS_TRANSITION_NOT_ALLOWED_FOR_PROFESSIONAL',
      });

      await appointments.status(
        tenantId,
        linkedAppointment.publicId,
        'CONFIRMED',
        undefined,
        actor,
      );

      await expect(
        appointments.statusForProfessional(
          tenantId,
          professionalId,
          otherAppointment.publicId,
          'IN_PROGRESS',
          undefined,
          actor,
        ),
      ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });

      const inProgress = await appointments.statusForProfessional(
        tenantId,
        professionalId,
        linkedAppointment.publicId,
        'IN_PROGRESS',
        undefined,
        actor,
      );
      expect(inProgress).toEqual({ success: true });

      const completed = await appointments.statusForProfessional(
        tenantId,
        professionalId,
        linkedAppointment.publicId,
        'COMPLETED',
        undefined,
        actor,
      );
      expect(completed).toEqual({ success: true });

      const finalState = await appointments.getForProfessional(
        tenantId,
        professionalId,
        linkedAppointment.publicId,
      );
      expect(finalState.status).toBe('COMPLETED');
    });
  },
);
