import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerRecoveryService } from '../src/modules/customers/customer-recovery.service.js';
import { CustomerRecoveryRepository } from '../src/modules/customers/customer-recovery.repository.js';
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
  'Birthday Idempotency - Annual Sending (Fase 9)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let customerId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `birthday-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Birthday Test',
          displayName: 'Birthday Test',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;

      // Criar regra de aniversário
      await client.customerRecoveryRule.upsert({
        where: { tenantId_rule: { tenantId, rule: 'BIRTHDAY' } },
        create: {
          tenantId,
          rule: 'BIRTHDAY',
          active: true,
          days: 0,
          publicId: randomUUID(),
        },
        update: { active: true },
      });

      // Cliente com birthday hoje (agosto 23)
      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Aniversariante',
          email: 'birthday@test.invalid',
          birthDate: new Date(1990, 7, 23), // 23 de agosto (mês = 7)
          acceptsCommunications: true,
        },
      });
      customerId = customer.id;
    });

    afterEach(async () => {
      await client.customerRecoveryExecution.deleteMany({ where: { tenantId } });
      await client.customerRecoveryRule.deleteMany({ where: { tenantId } });
      await client.notificationLog.deleteMany({ where: { tenantId } });
      await client.customer.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('9️⃣ BIRTHDAY ANNUAL — Não duplica no mesmo ano, envia novamente no próximo', async () => {
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
      const repository = new CustomerRecoveryRepository(client);
      const recoveryService = new CustomerRecoveryService(repository, dispatcher);

      // Executa recovery no dia 23/08/2026 (aniversário)
      const aug23_2026 = new Date(2026, 7, 23, 12, 0, 0);

      const result1 = await recoveryService.run(aug23_2026, tenantId);
      expect(result1).toBe(1); // Uma notificação enviada

      // Verifica que foi criado
      const executions1 = await client.customerRecoveryExecution.findMany({
        where: { tenantId },
      });
      expect(executions1).toHaveLength(1);
      expect(executions1[0]?.status).toBe('SENT');

      // Executa recovery NOVAMENTE no mesmo dia (não deve enviar)
      const result2 = await recoveryService.run(aug23_2026, tenantId);
      expect(result2).toBe(0); // Nada enviado

      // Verifica que não foi duplicada
      const executions2 = await client.customerRecoveryExecution.findMany({
        where: { tenantId },
      });
      expect(executions2).toHaveLength(1);

      // Limpa dados
      await client.customerRecoveryExecution.deleteMany({ where: { tenantId } });
      emailDelivery.messages.length = 0;

      // Simula ano seguinte: 23/08/2027
      const aug23_2027 = new Date(2027, 7, 23, 12, 0, 0);

      const result3 = await recoveryService.run(aug23_2027, tenantId);
      expect(result3).toBe(1); // Uma notificação enviada no próximo ano

      // Verifica que foi criada nova execution
      const executions3 = await client.customerRecoveryExecution.findMany({
        where: { tenantId },
      });
      expect(executions3).toHaveLength(1);
      expect(executions3[0]?.status).toBe('SENT');
    });

    it('✅ BIRTHDAY — Não envia se cliente sem email', async () => {
      // Cliente sem email
      const customerNoEmail = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Sem Email',
          email: null,
          birthDate: new Date(1990, 7, 23),
          acceptsCommunications: true,
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
      const repository = new CustomerRecoveryRepository(client);
      const recoveryService = new CustomerRecoveryService(repository, dispatcher);

      const aug23 = new Date(2026, 7, 23, 12, 0, 0);
      const result = await recoveryService.run(aug23, tenantId);

      // Esperado: apenas 1 enviada (cliente com email)
      // Cliente sem email não é elegível
      expect(result).toBe(1);

      const logs = await client.notificationLog.findMany({
        where: { tenantId, kind: 'customer.recovery.birthday' },
      });

      // Apenas um log (cliente com email)
      expect(logs).toHaveLength(1);
      expect(logs[0]?.recipient).toBe('birthday@test.invalid');
    });
  },
);
