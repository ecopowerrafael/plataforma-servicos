import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerProfileService } from '../src/modules/customers/customer-profile.service.js';
import { CustomerRepository } from '../src/modules/customers/customer.repository.js';
import { CustomerService } from '../src/modules/customers/customer.service.js';
import { AppointmentNotificationService } from '../src/modules/notifications/appointment-notification.service.js';
import { CustomerNotificationDispatcher } from '../src/modules/notifications/customer-notification-dispatcher.js';
import {
  CapturingEmailDelivery,
  UnconfiguredEmailDelivery,
} from '../src/modules/notifications/email-delivery.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { UnconfiguredPushDelivery } from '../src/modules/notifications/push-delivery.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'fila assíncrona de notificações (Etapa 13) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let otherTenantId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `notif-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `notif-other-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Outro',
          displayName: 'Outro',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
      otherTenantId = other.id;
    });

    afterEach(async () => {
      const ids = [tenantId, otherTenantId];
      await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.notificationLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.notificationTemplate.deleteMany({ where: { tenantId: { in: ids } } });
      await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
    });

    it('enqueue() apenas grava PENDING, sem tentar o envio de forma síncrona', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });

      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId: randomUUID(),
        recipient: 'cliente@test.invalid',
        subject: 'Assunto de teste',
        body: 'Corpo de teste',
      });

      expect(delivery.messages).toHaveLength(0);
      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('PENDING');
      expect(items[0]?.attempts).toBe(0);
    });

    it('processPending() envia o que está PENDING e registra o resultado', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId: randomUUID(),
        recipient: 'cliente@test.invalid',
        subject: 'Assunto',
        body: 'Corpo',
      });

      const result = await service.processPending();
      expect(result.processed).toBe(1);
      expect(delivery.messages).toHaveLength(1);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('SENT');
      expect(items[0]?.attempts).toBe(1);
      expect(items[0]?.sentAt).not.toBeNull();
    });

    it('marca como SKIPPED quando o SMTP não está configurado, sem lançar erro nem perder a notificação', async () => {
      const service = new NotificationService(client, {
        email: new UnconfiguredEmailDelivery(),
        push: new UnconfiguredPushDelivery(),
      });
      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId: randomUUID(),
        recipient: 'cliente@test.invalid',
        subject: 'Assunto',
        body: 'Corpo',
      });

      await service.processPending();

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('SKIPPED');
      expect(items[0]?.lastError).not.toBeNull();
    });

    it('impede duplicidade de envio para o mesmo evento (kind + target) via constraint de idempotência', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const targetPublicId = randomUUID();

      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId,
        recipient: 'cliente@test.invalid',
        subject: 'Primeira',
        body: 'Corpo',
      });
      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId,
        recipient: 'cliente@test.invalid',
        subject: 'Segunda tentativa de enfileirar o mesmo evento',
        body: 'Corpo',
      });

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items).toHaveLength(1);
      expect(items[0]?.subject).toBe('Primeira');
    });

    it('impede processamento concorrente da mesma notificação (claim atômico)', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId: randomUUID(),
        recipient: 'cliente@test.invalid',
        subject: 'Assunto',
        body: 'Corpo',
      });

      const [first, second] = await Promise.all([
        service.processPending(),
        service.processPending(),
      ]);
      const totalProcessed = first.processed + second.processed;
      expect(totalProcessed).toBe(1);
      expect(delivery.messages).toHaveLength(1);
    });

    it('permite reenviar manualmente uma notificação que falhou e isola por tenant', async () => {
      class FailingThenSucceedingDelivery {
        public available = true;
        private calls = 0;
        public send(): Promise<void> {
          this.calls += 1;
          if (this.calls === 1) return Promise.reject(new Error('Falha simulada de rede'));
          return Promise.resolve();
        }
      }
      const delivery = new FailingThenSucceedingDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });

      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId: randomUUID(),
        recipient: 'cliente@test.invalid',
        subject: 'Assunto',
        body: 'Corpo',
      });
      await service.processPending();
      const before = await service.list(tenantId, { page: 1, limit: 20 });
      expect(before.items[0]?.status).toBe('FAILED');
      expect(before.items[0]?.attempts).toBe(1);
      const publicId = before.items[0]?.publicId;
      if (publicId === undefined) throw new Error('Notificação não encontrada.');

      await service.retry(tenantId, publicId);

      const after = await service.list(tenantId, { page: 1, limit: 20 });
      expect(after.items[0]?.status).toBe('SENT');
      expect(after.items[0]?.attempts).toBe(2);

      await expect(service.retry(otherTenantId, publicId)).rejects.toMatchObject({
        code: 'NOTIFICATION_NOT_FOUND',
      });
    });

    it('processPending() não reprocessa FAILED antes do backoff, mas mantém a falha registrada', async () => {
      class AlwaysFailingDelivery {
        public available = true;
        public send(): Promise<void> {
          return Promise.reject(new Error('Falha simulada'));
        }
      }
      const service = new NotificationService(client, {
        email: new AlwaysFailingDelivery(),
        push: new UnconfiguredPushDelivery(),
      });
      await service.enqueue(tenantId, {
        kind: 'appointment.booking_confirmed',
        targetType: 'appointment',
        targetPublicId: randomUUID(),
        recipient: 'cliente@test.invalid',
        subject: 'Assunto',
        body: 'Corpo',
      });

      await service.processPending();
      const secondRun = await service.processPending();
      expect(secondRun.processed).toBe(0);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('FAILED');
      expect(items[0]?.attempts).toBe(1);
    });

    it('respeita a preferência de comunicação do cliente ao enfileirar confirmação de agendamento', async () => {
      const delivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const templates = new NotificationTemplateService(client);
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
      const appointmentNotifications = new AppointmentNotificationService(client, dispatcher);

      const optedOut = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente sem opt-in',
          email: 'sem-optin@test.invalid',
          acceptsCommunications: false,
        },
      });
      const optedInNoEmail = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente sem e-mail',
          email: null,
          acceptsCommunications: true,
        },
      });
      const optedIn = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente com opt-in',
          email: 'com-optin@test.invalid',
          acceptsCommunications: true,
        },
      });

      const appointmentPayload = (customerPublicId: string, customerName: string) => ({
        publicId: randomUUID(),
        protocol: 'AGD-000001',
        customerPublicId,
        customerName,
        customerPhone: null,
        professionalPublicId: randomUUID(),
        professionalName: 'Profissional',
        servicePublicId: randomUUID(),
        serviceName: 'Serviço',
        unitPublicId: null,
        unitName: null,
        startsAt: new Date().toISOString(),
        endsAt: new Date().toISOString(),
        durationMinutes: 30,
        postServiceBreakMinutes: 0,
        priceCents: '10000',
        status: 'PENDING' as const,
        notes: null,
        source: 'INTERNAL',
        canceledReason: null,
        rescheduleReason: null,
        isFitIn: false,
        fitInReason: null,
        checkedInAt: null,
        depositType: null,
        depositPercentage: null,
        depositAmountCents: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await appointmentNotifications.notifyBookingConfirmed(
        tenantId,
        appointmentPayload(optedOut.publicId, optedOut.name),
      );
      await appointmentNotifications.notifyBookingConfirmed(
        tenantId,
        appointmentPayload(optedInNoEmail.publicId, optedInNoEmail.name),
      );
      expect((await notifications.list(tenantId, { page: 1, limit: 20 })).items).toHaveLength(0);

      await appointmentNotifications.notifyBookingConfirmed(
        tenantId,
        appointmentPayload(optedIn.publicId, optedIn.name),
      );
      const queued = await notifications.list(tenantId, { page: 1, limit: 20 });
      expect(queued.items).toHaveLength(1);
      expect(queued.items[0]?.recipient).toBe('com-optin@test.invalid');
      expect(queued.items[0]?.status).toBe('PENDING');

      await notifications.processPending();
      expect(delivery.messages).toHaveLength(1);
      expect(delivery.messages[0]?.to).toBe('com-optin@test.invalid');
    });

    it('a preferência de comunicação do cliente é persistida via CustomerProfileService', async () => {
      const repository = new CustomerRepository(client);
      const customerService = new CustomerService(repository);
      const profileService = new CustomerProfileService(repository, customerService);

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente perfil',
          email: 'perfil@test.invalid',
          acceptsCommunications: false,
        },
      });

      const initial = await profileService.get(tenantId, customer);
      expect(initial.profile.acceptsCommunications).toBe(false);

      const updated = await profileService.update(tenantId, customer, {
        name: customer.name,
        socialName: null,
        phone: null,
        whatsapp: null,
        email: customer.email,
        birthDate: null,
        document: null,
        acceptsCommunications: true,
        customFields: {},
      });
      expect(updated.profile.acceptsCommunications).toBe(true);

      const persisted = await client.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(persisted.acceptsCommunications).toBe(true);
    });
  },
);
