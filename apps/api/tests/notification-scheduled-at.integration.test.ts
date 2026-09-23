import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import {
  CapturingEmailDelivery,
  UnconfiguredEmailDelivery,
} from '../src/modules/notifications/email-delivery.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { UnconfiguredPushDelivery } from '../src/modules/notifications/push-delivery.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'NotificationService.processPending() com scheduledAt (Fase 9)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `notif-sched-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Teste',
          displayName: 'Teste',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
    });

    afterEach(async () => {
      await client.auditLog.deleteMany({ where: { tenantId } });
      await client.notificationLog.deleteMany({ where: { tenantId } });
      await client.notificationTemplate.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('1️⃣ PENDING com scheduledAt futuro NÃO é processado até a hora', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const now = new Date();
      const inFuture = new Date(now.getTime() + 60 * 60_000); // 1 hora depois

      await service.enqueue(
        tenantId,
        {
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          recipient: 'cliente@test.invalid',
          subject: 'Agendamento Futuro',
          body: 'Será enviado amanhã',
        },
        inFuture,
      );

      const result = await service.processPending(10, now);
      expect(result.processed).toBe(0);
      expect(delivery.messages).toHaveLength(0);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('PENDING');
    });

    it('2️⃣ PENDING com scheduledAt null (imediato) É processado', async () => {
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
        subject: 'Imediato',
        body: 'Sem agendamento',
      });

      const result = await service.processPending();
      expect(result.processed).toBe(1);
      expect(delivery.messages).toHaveLength(1);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('SENT');
    });

    it('3️⃣ PENDING com scheduledAt no passado É processado', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const now = new Date();
      const inPast = new Date(now.getTime() - 60 * 60_000); // 1 hora atrás

      await service.enqueue(
        tenantId,
        {
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          recipient: 'cliente@test.invalid',
          subject: 'Atrasado',
          body: 'Deveria ter sido enviado há 1 hora',
        },
        inPast,
      );

      const result = await service.processPending(10, now);
      expect(result.processed).toBe(1);
      expect(delivery.messages).toHaveLength(1);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('SENT');
    });

    it('4️⃣ PENDING com scheduledAt exatamente agora É processado', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const now = new Date();

      await service.enqueue(
        tenantId,
        {
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          recipient: 'cliente@test.invalid',
          subject: 'Agora',
          body: 'Exatamente agora',
        },
        now,
      );

      const result = await service.processPending(10, now);
      expect(result.processed).toBe(1);
      expect(delivery.messages).toHaveLength(1);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('SENT');
    });

    it('5️⃣ FAILED com scheduledAt futuro NÃO é reprocessado mesmo se backoff passou', async () => {
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
      const now = new Date();
      const futureTime = new Date(now.getTime() + 60 * 60_000); // 1 hora depois
      const longAgo = new Date(now.getTime() - 24 * 60 * 60_000); // 1 dia atrás

      await service.enqueue(
        tenantId,
        {
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          recipient: 'cliente@test.invalid',
          subject: 'Será retentado quando a hora chegar',
          body: 'Futuro',
        },
        futureTime,
      );

      // Simula que a notificação foi criada há 1 dia (backoff passou)
      await client.notificationLog.updateMany({
        where: { tenantId, status: 'PENDING' },
        data: { createdAt: longAgo, updatedAt: longAgo },
      });

      const result = await service.processPending(10, now);
      expect(result.processed).toBe(0);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('PENDING');
      expect(items[0]?.attempts).toBe(0);
    });

    it('6️⃣ PROCESSING com lease expirado mas scheduledAt futuro NÃO é reprocessado', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const now = new Date();
      const futureTime = new Date(now.getTime() + 60 * 60_000); // 1 hora depois
      const veryOld = new Date(now.getTime() - 24 * 60 * 60_000); // 1 dia atrás (lease expirou)

      await service.enqueue(
        tenantId,
        {
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          recipient: 'cliente@test.invalid',
          subject: 'Processando futuro',
          body: 'Corpo',
        },
        futureTime,
      );

      // Simula que travou em PROCESSING há 1 dia
      await client.notificationLog.updateMany({
        where: { tenantId, status: 'PENDING' },
        data: { status: 'PROCESSING', createdAt: veryOld, updatedAt: veryOld },
      });

      const result = await service.processPending(10, now);
      expect(result.processed).toBe(0);
      expect(delivery.messages).toHaveLength(0);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('PROCESSING');
    });

    it('7️⃣ Integração: recovery events (null scheduledAt) são processados imediatamente', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });

      // Simula enfileiramento de evento recovery SEM scheduledAt
      await service.enqueue(tenantId, {
        kind: 'customer.recovery.canceled',
        targetType: 'customer_recovery',
        targetPublicId: randomUUID(),
        recipient: 'cliente@test.invalid',
        subject: 'Recovery: Cancelado',
        body: 'Você cancelou seu atendimento',
      });

      const result = await service.processPending();
      expect(result.processed).toBe(1);
      expect(delivery.messages).toHaveLength(1);

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      expect(items[0]?.status).toBe('SENT');
    });

    it('🔄 Transition: agendamento com reminder futuro depois da transição para SENT', async () => {
      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });
      const now = new Date();
      const confirmationAt = new Date(now.getTime() - 10_000); // 10 segundos atrás (enviada)
      const reminderAt = new Date(now.getTime() + 60 * 60_000); // 1 hora depois (agendado)

      const appointmentId = randomUUID();

      // Confirmação foi enviada
      await service.enqueue(
        tenantId,
        {
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: appointmentId,
          recipient: 'cliente@test.invalid',
          subject: 'Confirmação',
          body: 'Agendamento confirmado',
        },
        confirmationAt,
      );
      await service.processPending(10, now);

      // Lembrete futuro (agendado para 1 hora depois)
      const reminderId = randomUUID();
      await service.enqueue(
        tenantId,
        {
          kind: 'appointment.day_before_reminder',
          targetType: 'appointment',
          targetPublicId: reminderId,
          recipient: 'cliente@test.invalid',
          subject: 'Lembrete: agendamento amanhã',
          body: 'Não esqueça',
        },
        reminderAt,
      );

      const result = await service.processPending(10, now);
      expect(result.processed).toBe(0); // Lembrete NOT enviado ainda
      expect(delivery.messages).toHaveLength(1); // Apenas confirmação

      const { items } = await service.list(tenantId, { page: 1, limit: 20 });
      const confirmation = items.find((i) => i.kind === 'appointment.booking_confirmed');
      const reminder = items.find((i) => i.kind === 'appointment.day_before_reminder');

      expect(confirmation?.status).toBe('SENT');
      expect(reminder?.status).toBe('PENDING');
      expect(reminder?.scheduledAt?.getTime()).toBe(reminderAt.getTime());
    });
  },
);
