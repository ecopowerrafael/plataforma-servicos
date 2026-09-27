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

// Mock WhatsApp Delivery
class CapturingWhatsAppDelivery {
  public available = true;
  public messages: Array<{
    tenantId: bigint;
    recipient: string;
    body: string;
    buttons: Array<{ label: string; buttonId: string }> | undefined;
  }> = [];

  public async send(tenantId: bigint, recipient: string, body: string): Promise<void> {
    this.messages.push({
      tenantId,
      recipient,
      body,
      buttons: undefined,
    });
  }

  public async sendInteractiveButtons(
    tenantId: bigint,
    recipient: string,
    body: string,
    buttons: Array<{ buttonId: string; label: string }>,
  ): Promise<{ externalMessageId: string; status: string; errorCode: string | null }> {
    this.messages.push({
      tenantId,
      recipient,
      body,
      buttons,
    });
    return {
      externalMessageId: randomUUID(),
      status: 'SENT',
      errorCode: null,
    };
  }
}

describe.skipIf(url === undefined)(
  'Recovery Events WhatsApp (Fase 9)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let customerId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `recovery-wa-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'WhatsApp Test',
          displayName: 'WhatsApp Test',
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
          name: 'Cliente WhatsApp',
          email: 'whatsapp@test.invalid',
          whatsapp: '+55 11 98765-4321',
          acceptsCommunications: true,
        },
      });
      customerId = customer.id;

      // Ativa WhatsApp para o tenant
      await client.tenantWhatsAppConfig.create({
        data: {
          tenantId,
          phoneNumberId: '1234567890',
          active: true,
        },
      });
    });

    afterEach(async () => {
      await client.tenantWhatsAppConfig.deleteMany({ where: { tenantId } });
      await client.notificationLog.deleteMany({ where: { tenantId } });
      await client.customer.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('7️⃣ RECOVERY CANCELED — WhatsApp enviado com recipient normalizado', async () => {
      const emailDelivery = new CapturingEmailDelivery();
      const whatsappDelivery = new CapturingWhatsAppDelivery();

      const notificationService = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
        whatsapp: whatsappDelivery as any,
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
          customerName: 'Cliente WhatsApp',
          referenceDate: '24/08/2026',
        },
        'customer_recovery',
      );

      expect(sent).toBe(true);

      // Verifica que NotificationLog foi criada para WhatsApp
      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.canceled',
          channel: 'WHATSAPP',
        },
      });

      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.recipient).toContain('55'); // Normalizado
      expect(log.status).toBe('PENDING');
    });

    it('7️⃣ RECOVERY NO_SHOW — WhatsApp enviado', async () => {
      const emailDelivery = new CapturingEmailDelivery();
      const whatsappDelivery = new CapturingWhatsAppDelivery();

      const notificationService = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
        whatsapp: whatsappDelivery as any,
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
          customerName: 'Cliente WhatsApp',
          referenceDate: '23/08/2026',
        },
        'customer_recovery',
      );

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.no_show',
          channel: 'WHATSAPP',
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.status).toBe('PENDING');
    });

    it('7️⃣ RECOVERY POST_SERVICE — WhatsApp enviado', async () => {
      const emailDelivery = new CapturingEmailDelivery();
      const whatsappDelivery = new CapturingWhatsAppDelivery();

      const notificationService = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
        whatsapp: whatsappDelivery as any,
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
          customerName: 'Cliente WhatsApp',
          referenceDate: '20/08/2026',
        },
        'customer_recovery',
      );

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.post_service',
          channel: 'WHATSAPP',
        },
      });

      expect(logs).toHaveLength(1);
    });

    it('7️⃣ RECOVERY BIRTHDAY — WhatsApp enviado', async () => {
      const emailDelivery = new CapturingEmailDelivery();
      const whatsappDelivery = new CapturingWhatsAppDelivery();

      const notificationService = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
        whatsapp: whatsappDelivery as any,
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
          customerName: 'Cliente WhatsApp',
        },
        'customer_recovery',
      );

      const logs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.birthday',
          channel: 'WHATSAPP',
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.status).toBe('PENDING');
    });

    it('✅ EMAIL + WHATSAPP AMBOS ENVIADOS', async () => {
      const emailDelivery = new CapturingEmailDelivery();
      const whatsappDelivery = new CapturingWhatsAppDelivery();

      const notificationService = new NotificationService(client, {
        email: emailDelivery,
        push: new UnconfiguredPushDelivery(),
        whatsapp: whatsappDelivery as any,
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
        'customer.recovery.canceled',
        targetId,
        {
          customerName: 'Cliente WhatsApp',
          referenceDate: '24/08/2026',
        },
        'customer_recovery',
      );

      const emailLogs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.canceled',
          channel: 'EMAIL',
        },
      });

      const whatsappLogs = await client.notificationLog.findMany({
        where: {
          tenantId,
          kind: 'customer.recovery.canceled',
          channel: 'WHATSAPP',
        },
      });

      expect(emailLogs).toHaveLength(1);
      expect(whatsappLogs).toHaveLength(1);
      expect(emailLogs[0]?.recipient).toBe('whatsapp@test.invalid');
      expect(whatsappLogs[0]?.recipient).toContain('55');
    });
  },
);
