import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  'NotificationService com FAILED/PROCESSING futuro (Fase 9)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `notif-fail-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Teste FAILED',
          displayName: 'Teste FAILED',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
    });

    afterEach(async () => {
      await client.notificationLog.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('3️⃣ FAILED FUTURO — Não reprocessa mesmo se backoff passou', async () => {
      const now = new Date();
      const futureTime = new Date(now.getTime() + 60 * 60_000); // 1 hora depois
      const veryOld = new Date(now.getTime() - 24 * 60 * 60_000); // 1 dia atrás

      // Criar notificação com status FAILED
      const log = await client.notificationLog.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          channel: 'EMAIL',
          recipient: 'test@invalid.com',
          subject: 'Teste FAILED futuro',
          body: 'Corpo',
          status: 'FAILED',
          attempts: 1,
          lastError: 'Simulada: Erro de rede',
          createdAt: veryOld,
          updatedAt: veryOld,
          scheduledAt: futureTime,
        },
      });

      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });

      // Executa processPending com now = hoje
      const result = await service.processPending(10, now);

      // Esperado: NÃO processa
      expect(result.processed).toBe(0);
      expect(delivery.messages).toHaveLength(0);

      // Verifica status no banco
      const updated = await client.notificationLog.findUniqueOrThrow({
        where: { id: log.id },
      });
      expect(updated.status).toBe('FAILED');
      expect(updated.attempts).toBe(1); // Não incrementou
    });

    it('4️⃣ PROCESSING FUTURO — Não reprocessa mesmo se lease expirou', async () => {
      const now = new Date();
      const futureTime = new Date(now.getTime() + 60 * 60_000); // 1 hora depois
      const veryOld = new Date(now.getTime() - 24 * 60 * 60_000); // 1 dia atrás

      // Criar notificação com status PROCESSING (travada)
      const log = await client.notificationLog.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          channel: 'EMAIL',
          recipient: 'test@invalid.com',
          subject: 'Teste PROCESSING futuro',
          body: 'Corpo',
          status: 'PROCESSING',
          attempts: 0,
          createdAt: veryOld,
          updatedAt: veryOld,
          scheduledAt: futureTime,
        },
      });

      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });

      // Executa processPending com now = hoje
      const result = await service.processPending(10, now);

      // Esperado: NÃO processa (scheduledAt futuro tem prioridade)
      expect(result.processed).toBe(0);
      expect(delivery.messages).toHaveLength(0);

      // Verifica status continua PROCESSING
      const updated = await client.notificationLog.findUniqueOrThrow({
        where: { id: log.id },
      });
      expect(updated.status).toBe('PROCESSING');
      expect(updated.attempts).toBe(0);
    });

    it('✅ FALHOU NO PASSADO — Reprocessa quando backoff + scheduledAt passado', async () => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - 60 * 60_000); // 1 hora atrás
      const veryOld = new Date(now.getTime() - 24 * 60 * 60_000); // 1 dia atrás

      // Criar notificação que falhou há 1 dia e tem scheduledAt passado
      await client.notificationLog.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          kind: 'appointment.booking_confirmed',
          targetType: 'appointment',
          targetPublicId: randomUUID(),
          channel: 'EMAIL',
          recipient: 'test@invalid.com',
          subject: 'Teste FAILED passado',
          body: 'Corpo',
          status: 'FAILED',
          attempts: 1,
          lastError: 'Simulada',
          createdAt: veryOld,
          updatedAt: veryOld,
          scheduledAt: pastTime, // Passado
        },
      });

      const delivery = new CapturingEmailDelivery();
      const service = new NotificationService(client, {
        email: delivery,
        push: new UnconfiguredPushDelivery(),
      });

      const result = await service.processPending(10, now);

      // Esperado: reprocessa porque backoff passou AND scheduledAt <= now
      expect(result.processed).toBe(1);
      expect(delivery.messages).toHaveLength(1);
    });
  },
);
