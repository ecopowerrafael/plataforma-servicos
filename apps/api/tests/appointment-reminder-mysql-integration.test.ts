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

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'lembretes automáticos de agendamento (Etapa 13) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let otherTenantId: bigint;
    let professionalId: bigint;
    let serviceId: bigint;

    const create = (
      startsAt: Date,
      customerEmail: string | null,
      acceptsCommunications: boolean,
      forTenantId = tenantId,
    ) =>
      client.customer
        .create({
          data: {
            publicId: randomUUID(),
            tenantId: forTenantId,
            name: `Cliente ${randomUUID().slice(0, 4)}`,
            email: customerEmail,
            acceptsCommunications,
          },
        })
        .then((customer) =>
          client.appointment.create({
            data: {
              publicId: randomUUID(),
              protocol: `AGD-${randomUUID().slice(0, 6)}`,
              tenantId: forTenantId,
              customerId: customer.id,
              professionalId,
              serviceId,
              startsAt,
              endsAt: new Date(startsAt.getTime() + 30 * 60_000),
              priceCents: 10_000n,
              durationMinutes: 30,
              source: 'INTERNAL',
            },
          }),
        );

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `remind-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `remind-other-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Outro',
          displayName: 'Outro',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
      otherTenantId = other.id;

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

      await client.appointmentReminderConfig.create({
        data: {
          tenantId: otherTenantId,
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
          name: 'Profissional',
          publicName: 'Profissional',
          calendarColor: '#111111',
        },
      });
      const service = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Consulta',
          durationMinutes: 30,
          hasPostServiceBreak: false,
          priceCents: 10_000n,
          color: '#222222',
        },
      });
      professionalId = professional.id;
      serviceId = service.id;
    });

    afterEach(async () => {
      const ids = [tenantId, otherTenantId];
      await client.notificationLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
      await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointmentReminderConfig.deleteMany({ where: { tenantId: { in: ids } } });
      await client.service.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
    });

    it('agenda lembretes para agendamentos válidos (transacionais ignoram acceptsCommunications)', async () => {
      const delivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const reminders = new AppointmentReminderService(client, dispatcher);

      const withinWindow = await create(
        new Date(Date.now() + 12 * 3_600_000),
        'dentro-janela@test.invalid',
        true,
      );
      const transactionalNoOptin = await create(
        new Date(Date.now() + 10 * 3_600_000),
        'transactional-no-optin@test.invalid',
        false,
      );
      await create(new Date(Date.now() + 10 * 3_600_000), null, true);

      const result = await reminders.scheduleUpcomingReminders();
      expect(result.scheduled).toBe(2);

      const { items } = await notifications.list(tenantId, { page: 1, limit: 20 });
      expect(items).toHaveLength(2);

      const byRecipient = new Map(items.map((i) => [i.recipient, i]));
      const item1 = byRecipient.get('dentro-janela@test.invalid');
      const item2 = byRecipient.get('transactional-no-optin@test.invalid');

      expect(item1?.kind).toBe('appointment.upcoming_reminder');
      expect(item1?.targetPublicId).toBe(withinWindow.publicId);
      expect(item1?.status).toBe('PENDING');

      expect(item2?.kind).toBe('appointment.upcoming_reminder');
      expect(item2?.targetPublicId).toBe(transactionalNoOptin.publicId);
      expect(item2?.status).toBe('PENDING');
    });

    it('não duplica o lembrete em execuções subsequentes do scheduler (idempotência)', async () => {
      const delivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const reminders = new AppointmentReminderService(client, dispatcher);

      await create(new Date(Date.now() + 12 * 3_600_000), 'repetido@test.invalid', true);

      const first = await reminders.scheduleUpcomingReminders();
      expect(first.scheduled).toBe(1);
      const second = await reminders.scheduleUpcomingReminders();
      expect(second.scheduled).toBe(0);

      const { items } = await notifications.list(tenantId, { page: 1, limit: 20 });
      expect(items).toHaveLength(1);
    });

    it('isola o agendamento de lembretes por tenant', async () => {
      const delivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const reminders = new AppointmentReminderService(client, dispatcher);

      await create(
        new Date(Date.now() + 12 * 3_600_000),
        'outro-tenant@test.invalid',
        true,
        otherTenantId,
      );

      await reminders.scheduleUpcomingReminders();

      const own = await notifications.list(tenantId, { page: 1, limit: 20 });
      expect(own.items).toHaveLength(0);
      const otherTenant = await notifications.list(otherTenantId, { page: 1, limit: 20 });
      expect(otherTenant.items).toHaveLength(1);
    });
  },
);
