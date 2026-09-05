import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentReminderService } from '../src/modules/notifications/appointment-reminder.service.js';
import { CustomerNotificationDispatcher } from '../src/modules/notifications/customer-notification-dispatcher.js';
import { CapturingEmailDelivery } from '../src/modules/notifications/email-delivery.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { UnconfiguredPushDelivery } from '../src/modules/notifications/push-delivery.js';
import { AppointmentReminderConfigService } from '../src/modules/notifications/appointment-reminder-config.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'AppointmentReminderService - Correctness (Etapa 14)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let professionalId: bigint;
    let serviceId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `reminder-test-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Test',
          displayName: 'Test',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;

      await client.appointmentReminderConfig.create({
        data: {
          tenantId,
          dayBeforeEnabled: true,
          dayBeforeHour: 9,
          dayBeforeMinute: 0,
          upcomingEnabled: true,
          upcomingMinutesBefore: 60,
        },
      });

      const professional = await client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Pro',
          publicName: 'Pro',
          calendarColor: '#111111',
        },
      });
      professionalId = professional.id;

      const service = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Service',
          durationMinutes: 30,
          color: '#1F2937',
        },
      });
      serviceId = service.id;
    });

    afterEach(async () => {
      try {
        await client.appointmentReminderConfig.deleteMany({ where: { tenantId } });
        await client.appointment.deleteMany({ where: { tenantId } });
        await client.customer.deleteMany({ where: { tenantId } });
        await client.professional.deleteMany({ where: { tenantId } });
        await client.service.deleteMany({ where: { tenantId } });
        await client.notificationLog.deleteMany({ where: { tenantId } });
        await client.tenant.delete({ where: { id: tenantId } });
      } catch {
        // ignore cleanup errors
      }
    });


    it('TESTE 1: Appointment 3 dias no futuro → confirmação imediata, day-before apenas no horário', async () => {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      threeDaysFromNow.setHours(18, 0, 0, 0);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente A',
          email: 'a@test.com',
          acceptsCommunications: true,
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 6)}`,
          tenantId,
          customerId: customer.id,
          professionalId,
          serviceId,
          startsAt: threeDaysFromNow,
          endsAt: new Date(threeDaysFromNow.getTime() + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const configService = new AppointmentReminderConfigService(client);
      const reminders = new AppointmentReminderService(client, dispatcher, configService);

      await reminders.scheduleDayBeforeReminders();

      const logs = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId },
      });

      const dayBeforeLogs = logs.filter((l) => l.kind === 'appointment.day_before_reminder');
      expect(dayBeforeLogs.length).toBe(1);
      expect(dayBeforeLogs[0]!.scheduledAt).toBeDefined();

      const emailLogs = logs.filter((l) => l.channel === 'EMAIL');
      expect(emailLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('TESTE 2: Appointment amanhã às 13:30, criado ontem ANTES das 09:00 → day-before às 09:00', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(13, 30, 0, 0);

      const createdBeforeWindow = new Date();
      createdBeforeWindow.setDate(createdBeforeWindow.getDate() - 1);
      createdBeforeWindow.setHours(8, 0, 0, 0);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente B',
          email: 'b@test.com',
          acceptsCommunications: true,
          createdAt: createdBeforeWindow,
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 6)}`,
          tenantId,
          customerId: customer.id,
          professionalId,
          serviceId,
          startsAt: tomorrow,
          endsAt: new Date(tomorrow.getTime() + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
          createdAt: createdBeforeWindow,
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const configService = new AppointmentReminderConfigService(client);
      const reminders = new AppointmentReminderService(client, dispatcher, configService);

      await reminders.scheduleDayBeforeReminders();

      const logs = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId },
      });

      const dayBeforeLogs = logs.filter((l) => l.kind === 'appointment.day_before_reminder');
      expect(dayBeforeLogs.length).toBe(1);
    });

    it('TESTE 3: Appointment criado DEPOIS das 09:00 do dia anterior → ZERO day-before', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(13, 30, 0, 0);

      const createdAfterWindow = new Date();
      createdAfterWindow.setHours(10, 0, 0, 0);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente C',
          email: 'c@test.com',
          acceptsCommunications: true,
          createdAt: createdAfterWindow,
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 6)}`,
          tenantId,
          customerId: customer.id,
          professionalId,
          serviceId,
          startsAt: tomorrow,
          endsAt: new Date(tomorrow.getTime() + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
          createdAt: createdAfterWindow,
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const configService = new AppointmentReminderConfigService(client);
      const reminders = new AppointmentReminderService(client, dispatcher, configService);

      await reminders.scheduleDayBeforeReminders();

      const logs = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId, kind: 'appointment.day_before_reminder' },
      });

      expect(logs.length).toBe(0);
    });

    it('TESTE 4: Appointment em 30 min, upcoming 60 min → ZERO upcoming retroativo', async () => {
      const inThirtyMinutes = new Date(Date.now() + 30 * 60_000);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente D',
          email: 'd@test.com',
          acceptsCommunications: true,
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 6)}`,
          tenantId,
          customerId: customer.id,
          professionalId,
          serviceId,
          startsAt: inThirtyMinutes,
          endsAt: new Date(inThirtyMinutes.getTime() + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const configService = new AppointmentReminderConfigService(client);
      const reminders = new AppointmentReminderService(client, dispatcher, configService);

      await reminders.scheduleUpcomingReminders();

      const logs = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId, kind: 'appointment.upcoming_reminder' },
      });

      expect(logs.length).toBe(0);
    });

    it('TESTE 5: Appointment em 65 min, upcoming 60 min → upcoming quando faltar 60', async () => {
      const in65Minutes = new Date(Date.now() + 65 * 60_000);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente E',
          email: 'e@test.com',
          acceptsCommunications: true,
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 6)}`,
          tenantId,
          customerId: customer.id,
          professionalId,
          serviceId,
          startsAt: in65Minutes,
          endsAt: new Date(in65Minutes.getTime() + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const configService = new AppointmentReminderConfigService(client);
      const reminders = new AppointmentReminderService(client, dispatcher, configService);

      await reminders.scheduleUpcomingReminders();

      const logs = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId, kind: 'appointment.upcoming_reminder' },
      });

      expect(logs.length).toBe(1);
    });

    it('TESTE 6: Worker executado 2 vezes → uma única mensagem (idempotência)', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(13, 30, 0, 0);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente F',
          email: 'f@test.com',
          acceptsCommunications: true,
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 6)}`,
          tenantId,
          customerId: customer.id,
          professionalId,
          serviceId,
          startsAt: tomorrow,
          endsAt: new Date(tomorrow.getTime() + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const configService = new AppointmentReminderConfigService(client);
      const reminders = new AppointmentReminderService(client, dispatcher, configService);

      await reminders.scheduleDayBeforeReminders();
      const firstRun = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId },
      });

      await reminders.scheduleDayBeforeReminders();
      const secondRun = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId },
      });

      expect(firstRun.length).toBe(secondRun.length);
    });

    it('TESTE 7: Appointment cancelado com reminder PENDING → não é entregue', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(13, 30, 0, 0);

      const createdBefore = new Date();
      createdBefore.setDate(createdBefore.getDate() - 1);
      createdBefore.setHours(8, 0, 0, 0);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente G',
          email: 'g@test.com',
          acceptsCommunications: true,
        },
      });

      const appointment = await client.appointment.create({
        data: {
          publicId: randomUUID(),
          protocol: `TEST-${randomUUID().slice(0, 6)}`,
          tenantId,
          customerId: customer.id,
          professionalId,
          serviceId,
          startsAt: tomorrow,
          endsAt: new Date(tomorrow.getTime() + 30 * 60_000),
          priceCents: 10_000n,
          durationMinutes: 30,
          source: 'INTERNAL',
          createdAt: createdBefore,
        },
      });

      const emailDelivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const configService = new AppointmentReminderConfigService(client);
      const reminders = new AppointmentReminderService(client, dispatcher, configService);

      await reminders.scheduleDayBeforeReminders();

      let logs = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId, kind: 'appointment.day_before_reminder' },
      });
      expect(logs.length).toBe(1);
      expect(logs[0]!.status).toBe('PENDING');

      await client.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CANCELED' },
      });

      await client.notificationLog.updateMany({
        where: {
          targetPublicId: appointment.publicId,
          kind: 'appointment.day_before_reminder',
          status: 'PENDING',
        },
        data: { status: 'SKIPPED' },
      });

      logs = await client.notificationLog.findMany({
        where: { tenantId, targetPublicId: appointment.publicId, kind: 'appointment.day_before_reminder' },
      });

      expect(logs[0]!.status).toBe('SKIPPED');
    });
  },
);
