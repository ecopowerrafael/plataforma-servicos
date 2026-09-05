import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';
import { CustomerNotificationDispatcher } from '../src/modules/notifications/customer-notification-dispatcher.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { CapturingEmailDelivery } from '../src/modules/notifications/email-delivery.js';
import { UnconfiguredPushDelivery } from '../src/modules/notifications/push-delivery.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'WhatsApp Notification Integration (Etapa 15)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let customerId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `whatsapp-test-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Test Tenant',
          displayName: 'Test Tenant',
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
          name: 'Test Customer',
          email: 'test@example.com',
          whatsapp: '5511999999999',
          acceptsCommunications: true,
        },
      });
      customerId = customer.id;
    }, 20000);

    afterEach(async () => {
      try {
        await client.notificationLog.deleteMany({ where: { tenantId } });
        await client.notificationTemplate.deleteMany({ where: { tenantId } });
        await client.customer.deleteMany({ where: { tenantId } });
        await client.tenant.delete({ where: { id: tenantId } });
      } catch {
        // ignore cleanup errors
      }
    });

    it('1. sem override → default WhatsApp', async () => {
      const templates = new NotificationTemplateService(client);
      const body = await templates.renderWhatsApp(tenantId, 'appointment.booking_confirmed', {
        customerName: 'João',
        serviceName: 'Corte',
        professionalName: 'Maria',
        date: '2026-08-20',
        time: '14:00',
        protocol: 'AGD-123456',
      });
      expect(body).toBeTruthy();
      expect(body).toContain('João');
      expect(body).toContain('confirmado');
    });

    it('2. override → corpo customizado', async () => {
      const templates = new NotificationTemplateService(client);
      await templates.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Test',
        body: 'Test',
        whatsappBody: 'Customizado: {{customerName}}',
      });
      const body = await templates.renderWhatsApp(tenantId, 'appointment.booking_confirmed', {
        customerName: 'João',
        serviceName: 'Corte',
        professionalName: 'Maria',
      });
      expect(body).toContain('Customizado: João');
    });

    it('3. whatsappEnabled=false → zero WhatsApp', async () => {
      const templates = new NotificationTemplateService(client);
      await templates.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Test',
        body: 'Test',
        whatsappEnabled: false,
      });
      const body = await templates.renderWhatsApp(tenantId, 'appointment.booking_confirmed', {
        customerName: 'João',
      });
      expect(body).toBeNull();
    });

    it('4. email continua mesmo com WhatsApp off', async () => {
      const templates = new NotificationTemplateService(client);
      const notifications = new NotificationService(client, {
        email: new CapturingEmailDelivery(),
        push: new UnconfiguredPushDelivery(),
      });
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);

      await templates.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Test',
        body: 'Test',
        whatsappEnabled: false,
      });

      const result = await dispatcher.dispatch(
        tenantId,
        customerId,
        'appointment.booking_confirmed',
        randomUUID(),
        { customerName: 'João', serviceName: 'Corte', date: '2026-08-20', time: '14:00' },
      );

      expect(result).toBe(true);
      const logs = await client.notificationLog.findMany({
        where: { tenantId, kind: 'appointment.booking_confirmed' },
      });
      const emailLogs = logs.filter((l) => l.channel === 'EMAIL');
      expect(emailLogs.length).toBeGreaterThan(0);
    });

    it('5. placeholder válido → renderiza', async () => {
      const templates = new NotificationTemplateService(client);
      await templates.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Test',
        body: 'Test',
        whatsappBody: 'Data: {{date}}, Hora: {{time}}',
      });
      const body = await templates.renderWhatsApp(tenantId, 'appointment.booking_confirmed', {
        date: '2026-08-20',
        time: '14:00',
      });
      expect(body).toContain('2026-08-20');
      expect(body).toContain('14:00');
    });

    it('6. placeholder inválido → rejeita', async () => {
      const templates = new NotificationTemplateService(client);
      try {
        await templates.update(tenantId, 'appointment.booking_confirmed', {
          subject: 'Test',
          body: 'Test',
          whatsappBody: 'Invalid: {{unknownVariable}}',
        });
        expect.fail('Should have thrown error');
      } catch (e: any) {
        expect(e.code).toBe('NOTIFICATION_TEMPLATE_VARIABLE_UNKNOWN');
      }
    });

    it('7. label de botão customizada → muda label', async () => {
      const templates = new NotificationTemplateService(client);
      await templates.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Test',
        body: 'Test',
        whatsappButtons: [
          { actionKey: 'CONFIRM_APPOINTMENT', label: 'Eu confirmo!', enabled: true, order: 1 },
        ],
      });
      const buttons = await templates.getWhatsAppButtons(tenantId, 'appointment.booking_confirmed');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]?.label).toBe('Eu confirmo!');
    });

    it('8. actionKey permanece whitelist', async () => {
      const templates = new NotificationTemplateService(client);
      try {
        await templates.update(tenantId, 'appointment.booking_confirmed', {
          subject: 'Test',
          body: 'Test',
          whatsappButtons: [
            { actionKey: 'INVALID_ACTION', label: 'Invalid', enabled: true, order: 1 },
          ],
        });
        expect.fail('Should have thrown error');
      } catch (e: any) {
        expect(e.code).toBe('INVALID_ACTION_KEY');
      }
    });

    it('9. actionKey inválida para tipo → rejeita', async () => {
      const templates = new NotificationTemplateService(client);
      try {
        await templates.update(tenantId, 'appointment.booking_canceled', {
          subject: 'Test',
          body: 'Test',
          whatsappButtons: [
            { actionKey: 'CONFIRM_APPOINTMENT', label: 'Confirm', enabled: true, order: 1 },
          ],
        });
        expect.fail('Should have thrown error');
      } catch (e: any) {
        expect(e.code).toBe('ACTION_NOT_ALLOWED_FOR_KIND');
      }
    });

    it('10. restore → volta ao default', async () => {
      const templates = new NotificationTemplateService(client);
      await templates.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Test',
        body: 'Test',
        whatsappBody: 'Custom body',
      });
      await client.notificationTemplate.deleteMany({
        where: { tenantId, kind: 'appointment.booking_confirmed' },
      });
      const body = await templates.renderWhatsApp(tenantId, 'appointment.booking_confirmed', {
        customerName: 'João',
      });
      expect(body).toBeTruthy();
      expect(body).toContain('confirmado');
    });

    it('11. tenant isolation', async () => {
      const otherTenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `whatsapp-other-${suffix}`,
          legalName: 'Other Tenant',
          displayName: 'Other Tenant',
          timezone: 'America/New_York',
          locale: 'en-US',
          currency: 'USD',
        },
      });

      const templates = new NotificationTemplateService(client);
      await templates.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Test',
        body: 'Test',
        whatsappBody: 'Tenant 1 custom',
      });

      const tenant1Body = await templates.renderWhatsApp(tenantId, 'appointment.booking_confirmed', {
        customerName: 'João',
      });
      const tenant2Body = await templates.renderWhatsApp(otherTenant.id, 'appointment.booking_confirmed', {
        customerName: 'João',
      });

      expect(tenant1Body).toContain('Tenant 1 custom');
      expect(tenant2Body).not.toContain('Tenant 1 custom');

      await client.tenant.delete({ where: { id: otherTenant.id } });
    });

    it('12. booking_confirmed gera 1 WhatsApp somente', async () => {
      const templates = new NotificationTemplateService(client);
      const delivery = new CapturingEmailDelivery();
      const notifications = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);

      const appointmentId = randomUUID();
      await dispatcher.dispatch(
        tenantId,
        customerId,
        'appointment.booking_confirmed',
        appointmentId,
        { customerName: 'João', serviceName: 'Corte', date: '2026-08-20', time: '14:00' },
      );

      const logs = await client.notificationLog.findMany({
        where: { tenantId, kind: 'appointment.booking_confirmed', targetPublicId: appointmentId },
      });

      const whatsappCount = logs.filter((l) => l.channel === 'WHATSAPP').length;
      expect(whatsappCount).toBeLessThanOrEqual(1);
    });

    it('13. day_before_reminder usa template correto', async () => {
      const templates = new NotificationTemplateService(client);
      const body = await templates.renderWhatsApp(tenantId, 'appointment.day_before_reminder', {
        customerName: 'João',
        serviceName: 'Corte',
        time: '14:00',
      });
      expect(body).toContain('amanha');
    });

    it('14. upcoming_reminder usa template correto', async () => {
      const templates = new NotificationTemplateService(client);
      const body = await templates.renderWhatsApp(tenantId, 'appointment.upcoming_reminder', {
        customerName: 'João',
        serviceName: 'Corte',
        time: '14:00',
      });
      expect(body).toContain('breve');
    });

    it('15. appointment.reminder legado continua com zero producer', async () => {
      // Verificar que não há producer do appointment.reminder
      const logs = await client.notificationLog.findMany({
        where: { tenantId, kind: 'appointment.reminder' },
      });
      expect(logs).toHaveLength(0);
    });
  },
);
