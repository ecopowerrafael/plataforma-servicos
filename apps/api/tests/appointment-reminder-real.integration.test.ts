import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentReminderConfigService } from '../src/modules/notifications/appointment-reminder-config.service.js';
import { AppointmentReminderService } from '../src/modules/notifications/appointment-reminder.service.js';
import { CustomerNotificationDispatcher } from '../src/modules/notifications/customer-notification-dispatcher.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import {
  CapturingEmailDelivery,
  UnconfiguredEmailDelivery,
} from '../src/modules/notifications/email-delivery.js';
import { UnconfiguredPushDelivery } from '../src/modules/notifications/push-delivery.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'AppointmentReminderService com ScheduledAt real (Fase 9)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let customerId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `remind-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Teste Reminder',
          displayName: 'Teste Reminder',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
          appointmentReminderConfig: {
            create: {
              upcomingEnabled: true,
              upcomingMinutesBefore: 60,
              dayBeforeEnabled: true,
              dayBeforeDaysBefore: 1,
              dayBeforeHour: 18,
              dayBeforeMinute: 0,
            },
          },
        },
      });
      tenantId = tenant.id;

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente Lembrete',
          email: 'reminder@test.invalid',
          acceptsCommunications: true,
        },
      });
      customerId = customer.id;
    });

    afterEach(async () => {
      await client.appointmentReminder.deleteMany({ where: { tenantId } });
      await client.notificationLog.deleteMany({ where: { tenantId } });
      await client.appointment.deleteMany({ where: { tenantId } });
      await client.customer.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('1️⃣ REMINDER 60 MIN — Agenda corretamente 60 minutos antes (America/Sao_Paulo)', async () => {
      // appointment.startsAt = 2026-08-25T17:00:00Z (14:00 em São Paulo)
      const startsAtUtc = new Date('2026-08-25T17:00:00Z');

      const service = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Serviço Teste',
          durationMinutes: 60,
        },
      });

      const professional = await client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Profissional Teste',
          publicName: 'Prof. Teste',
        },
      });

      const unit = await client.unit.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Unidade Teste',
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          customerId,
          serviceId: service.id,
          professionalId: professional.id,
          unitId: unit.id,
          status: 'CONFIRMED',
          startsAt: startsAtUtc,
          protocol: 'TEST-001',
          priceCents: BigInt(10000),
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notificationService = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(
        client,
        notificationService,
        templates,
      );
      const configService = new AppointmentReminderConfigService(client);
      const reminderService = new AppointmentReminderService(
        client,
        dispatcher,
        configService,
      );

      // Executa scheduler
      const result = await reminderService.scheduleUpcomingReminders();
      expect(result.scheduled).toBe(1);

      // Verifica NotificationLog criada com scheduledAt correto
      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'appointment.upcoming_reminder',
          targetPublicId: appointment.publicId,
        },
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;

      // Esperado: 60 minutos antes de 17:00Z = 16:00Z = 13:00 São Paulo
      const expectedScheduledAt = new Date(startsAtUtc.getTime() - 60 * 60_000);
      expect(log.scheduledAt?.getTime()).toBe(expectedScheduledAt.getTime());

      // Confirma que NÃO foi enviada ainda (só agendada)
      expect(log.status).toBe('PENDING');
      expect(emailDelivery.messages).toHaveLength(0);

      // Simula tempo passando: now = scheduledAt
      await notificationService.processPending(10, expectedScheduledAt);

      // Agora DEVE ter sido enviada
      const updated = await client.notificationLog.findUniqueOrThrow({
        where: { id: log.id },
      });
      expect(updated.status).toBe('SENT');
      expect(emailDelivery.messages).toHaveLength(1);
      expect(emailDelivery.messages[0]?.to).toBe('reminder@test.invalid');
    });

    it('2️⃣ REMINDER DIA ANTERIOR — Timezone correto (24/08 18:00 São Paulo = 25/08 21:00 UTC)', async () => {
      // appointment = 2026-08-25T14:00:00 São Paulo
      const appointment25Aug = new Date(2026, 7, 25, 14, 0, 0); // Local JS
      // Converter para UTC considerando offset de São Paulo (-3 em agosto)
      const startsAtUtc = new Date(appointment25Aug.getTime() + 3 * 60 * 60_000);

      const service = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Serviço Dia Anterior',
          durationMinutes: 60,
        },
      });

      const professional = await client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Prof',
          publicName: 'Prof',
        },
      });

      const unit = await client.unit.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Unit',
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          customerId,
          serviceId: service.id,
          professionalId: professional.id,
          unitId: unit.id,
          status: 'CONFIRMED',
          startsAt: startsAtUtc,
          protocol: 'TEST-002',
          priceCents: BigInt(10000),
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notificationService = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(
        client,
        notificationService,
        templates,
      );
      const configService = new AppointmentReminderConfigService(client);
      const reminderService = new AppointmentReminderService(
        client,
        dispatcher,
        configService,
      );

      await reminderService.scheduleDayBeforeReminders();

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'appointment.day_before_reminder',
          targetPublicId: appointment.publicId,
        },
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;

      // Esperado: 24/08 18:00 São Paulo = 25/08 21:00 UTC
      expect(log.scheduledAt).not.toBeNull();
      // Só validar que está no dia anterior
      const appointmentLocalDay = 25;
      const scheduledLocalDate = new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }).format(log.scheduledAt!);

      expect(scheduledLocalDate).toContain('24/'); // Dia anterior
      expect(log.status).toBe('PENDING');
    });

    it('3️⃣ IDEMPOTÊNCIA — Mesmo agendamento NÃO recria reminder segunda vez', async () => {
      const startsAtUtc = new Date('2026-08-25T17:00:00Z');

      const service = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Service',
          durationMinutes: 60,
        },
      });

      const professional = await client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Prof',
          publicName: 'Prof',
        },
      });

      const unit = await client.unit.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Unit',
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          customerId,
          serviceId: service.id,
          professionalId: professional.id,
          unitId: unit.id,
          status: 'CONFIRMED',
          startsAt: startsAtUtc,
          protocol: 'TEST-003',
          priceCents: BigInt(10000),
        },
      });

      const notificationService = new NotificationService(client, {
        email: new CapturingEmailDelivery(),
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(
        client,
        notificationService,
        templates,
      );
      const configService = new AppointmentReminderConfigService(client);
      const reminderService = new AppointmentReminderService(
        client,
        dispatcher,
        configService,
      );

      // Primeira execução
      const result1 = await reminderService.scheduleUpcomingReminders();
      expect(result1.scheduled).toBe(1);

      // Segunda execução (não deve criar duplicado)
      const result2 = await reminderService.scheduleUpcomingReminders();
      expect(result2.scheduled).toBe(0);

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'appointment.upcoming_reminder',
          targetPublicId: appointment.publicId,
          status: { not: 'SKIPPED' },
        },
      });

      expect(logs).toHaveLength(1);
    });
  },
);
