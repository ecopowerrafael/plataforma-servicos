import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerNotificationDispatcher } from '../src/modules/notifications/customer-notification-dispatcher.js';
import {
  CapturingEmailDelivery,
} from '../src/modules/notifications/email-delivery.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { UnconfiguredPushDelivery } from '../src/modules/notifications/push-delivery.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'Recovery Events + Booking Canceled Audit (Fase 9)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let customerId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `recovery-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Recovery Test',
          displayName: 'Recovery Test',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;

      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente Recovery',
          email: 'recovery@test.invalid',
          whatsapp: '+55 11 98765-4321',
          acceptsCommunications: true,
        },
      });
      customerId = customer.id;
    });

    afterEach(async () => {
      await client.notificationLog.deleteMany({ where: { tenantId } });
      await client.customer.deleteMany({ where: { tenantId } });
      await client.appointment.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('11️⃣ BOOKING CANCELED — EMAIL transacional enviado imediatamente', async () => {
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

      // Simula cancelamento de agendamento
      const targetId = randomUUID();
      await dispatcher.dispatch(
        tenantId,
        customerId,
        'appointment.booking_canceled',
        targetId,
        {
          customerName: 'Cliente Recovery',
          serviceName: 'Serviço Teste',
          professionalName: 'Prof. Teste',
          date: '25/08/2026',
          time: '14:00',
          protocol: 'AGD-123456',
          canceledReasonLine: '',
        },
        'appointment',
      );

      // Verifica que NotificationLog foi criada
      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'appointment.booking_canceled',
          channel: 'EMAIL',
        },
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.recipient).toBe('recovery@test.invalid');
      expect(log.status).toBe('PENDING');
      expect(log.subject).toContain('cancelado');

      // Processa fila (scheduledAt null = imediato)
      const result = await notificationService.processPending();
      expect(result.processed).toBe(1);
      expect(emailDelivery.messages).toHaveLength(1);
      expect(emailDelivery.messages[0]?.to).toBe('recovery@test.invalid');
    });

    it('6️⃣ RECOVERY CANCELED — EMAIL + opt-in preservado', async () => {
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

      const targetId = randomUUID();
      const sent = await dispatcher.dispatch(
        tenantId,
        customerId,
        'customer.recovery.canceled',
        targetId,
        {
          customerName: 'Cliente Recovery',
          referenceDate: '24/08/2026',
        },
        'customer_recovery',
      );

      expect(sent).toBe(true);

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.canceled',
          channel: 'EMAIL',
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.recipient).toBe('recovery@test.invalid');
      expect(logs[0]?.status).toBe('PENDING');
    });

    it('6️⃣ RECOVERY NO_SHOW — EMAIL + opt-in preservado', async () => {
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

      const targetId = randomUUID();
      await dispatcher.dispatch(
        tenantId,
        customerId,
        'customer.recovery.no_show',
        targetId,
        {
          customerName: 'Cliente Recovery',
          referenceDate: '23/08/2026',
        },
        'customer_recovery',
      );

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.no_show',
          channel: 'EMAIL',
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.recipient).toBe('recovery@test.invalid');
    });

    it('6️⃣ RECOVERY POST_SERVICE — EMAIL + opt-in preservado', async () => {
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

      const targetId = randomUUID();
      await dispatcher.dispatch(
        tenantId,
        customerId,
        'customer.recovery.post_service',
        targetId,
        {
          customerName: 'Cliente Recovery',
          referenceDate: '20/08/2026',
        },
        'customer_recovery',
      );

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.post_service',
          channel: 'EMAIL',
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.recipient).toBe('recovery@test.invalid');
    });

    it('6️⃣ RECOVERY BIRTHDAY — EMAIL + opt-in preservado', async () => {
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

      const targetId = randomUUID();
      await dispatcher.dispatch(
        tenantId,
        customerId,
        'customer.recovery.birthday',
        targetId,
        {
          customerName: 'Cliente Recovery',
        },
        'customer_recovery',
      );

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.birthday',
          channel: 'EMAIL',
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.recipient).toBe('recovery@test.invalid');
    });

    it('8️⃣ RECOVERY SEM OPT-IN — NÃO envia', async () => {
      // Cliente sem opt-in
      const optOutCustomer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente Sem Opt-in',
          email: 'optout@test.invalid',
          acceptsCommunications: false,
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

      const targetId = randomUUID();
      const sent = await dispatcher.dispatch(
        tenantId,
        optOutCustomer.id,
        'customer.recovery.canceled',
        targetId,
        {
          customerName: 'Cliente Sem Opt-in',
          referenceDate: '24/08/2026',
        },
        'customer_recovery',
      );

      expect(sent).toBe(false);

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.canceled',
        },
      });

      expect(logs).toHaveLength(0);
    });

    it('✅ BOOKING CANCELED TRANSACIONAL — Envia mesmo sem opt-in', async () => {
      // Cliente sem opt-in
      const optOutCustomer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente Sem Opt-in',
          email: 'optout@test.invalid',
          acceptsCommunications: false,
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

      const targetId = randomUUID();
      const sent = await dispatcher.dispatch(
        tenantId,
        optOutCustomer.id,
        'appointment.booking_canceled',
        targetId,
        {
          customerName: 'Cliente Sem Opt-in',
          serviceName: 'Serviço',
          professionalName: 'Prof',
          date: '25/08/2026',
          time: '14:00',
          protocol: 'AGD-123456',
          canceledReasonLine: '',
        },
        'appointment',
      );

      expect(sent).toBe(true); // Transacional envia sempre

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'appointment.booking_canceled',
          channel: 'EMAIL',
        },
      });

      expect(logs).toHaveLength(1);
    });
  },
);
