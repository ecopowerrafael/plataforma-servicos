import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerRecoveryRepository } from '../src/modules/customers/customer-recovery.repository.js';
import { CustomerRecoveryService, birthdayMatches } from '../src/modules/customers/customer-recovery.service.js';
import { CustomerNotificationDispatcher } from '../src/modules/notifications/customer-notification-dispatcher.js';
import { CapturingEmailDelivery } from '../src/modules/notifications/email-delivery.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { UnconfiguredPushDelivery } from '../src/modules/notifications/push-delivery.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'Recovery Eligibility Fixes (Fase 10)',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `recovery-fix-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Recovery Fix Test',
          displayName: 'Recovery Fix Test',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;

      // Criar regra de recuperação
      await client.customerRecoveryRule.upsert({
        where: { tenantId_rule: { tenantId, rule: 'POST_SERVICE_NO_RETURN' } },
        create: {
          tenantId,
          rule: 'POST_SERVICE_NO_RETURN',
          active: true,
          days: 30,
          publicId: randomUUID(),
        },
        update: { active: true },
      });
    });

    afterEach(async () => {
      await client.customerRecoveryExecution.deleteMany({ where: { tenantId } });
      await client.customerRecoveryRule.deleteMany({ where: { tenantId } });
      await client.appointment.deleteMany({ where: { tenantId } });
      await client.customer.deleteMany({ where: { tenantId } });
      await client.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('🟢 Cliente somente com WhatsApp é elegível para recovery', async () => {
      // Cliente com APENAS WhatsApp (sem email, sem push)
      const customer = await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente WhatsApp Only',
          email: null,
          whatsapp: '+55 11 98765-4321',
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

      // Criar agendamento completado há 31 dias (elegível para POST_SERVICE)
      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      const service = await client.service.create({
        data: { publicId: randomUUID(), tenantId, name: 'Serviço', durationMinutes: 60 },
      });
      const professional = await client.professional.create({
        data: { publicId: randomUUID(), tenantId, name: 'Prof', publicName: 'Prof' },
      });
      const unit = await client.unit.create({
        data: { publicId: randomUUID(), tenantId, name: 'Unit' },
      });

      await client.appointment.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          customerId: customer.id,
          serviceId: service.id,
          professionalId: professional.id,
          unitId: unit.id,
          status: 'COMPLETED',
          startsAt: thirtyOneDaysAgo,
          protocol: 'TEST-001',
          priceCents: BigInt(10000),
        },
      });

      // Executar recovery
      const processed = await recoveryService.run();

      // Esperado: 1 processada (cliente com WhatsApp é elegível)
      expect(processed).toBe(1);

      const executions = await client.customerRecoveryExecution.findMany({
        where: { tenantId },
      });
      expect(executions).toHaveLength(1);
      expect(executions[0]?.status).toBe('SENT');
    });

    it('🔴 Cliente sem email, push ou WhatsApp é INELEGÍVEL', async () => {
      // Cliente SEM nenhum canal
      await client.customer.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Cliente Sem Canais',
          email: null,
          whatsapp: null,
          acceptsCommunications: true,
        },
      });

      const repository = new CustomerRecoveryRepository(client);
      const recoveryService = new CustomerRecoveryService(
        repository,
        {} as any,
      );

      const processed = await recoveryService.run();

      // Esperado: 0 processadas (cliente sem canais é inelegível)
      expect(processed).toBe(0);
    });

    it('🎂 Aniversário respeita timezone America/Sao_Paulo', () => {
      // Data de nascimento: 23 de agosto
      const birthDate = new Date(1990, 7, 23);

      // Simula: 24 de agosto 00:00 UTC (ainda 23 de agosto em São Paulo)
      const now = new Date('2026-08-24T00:00:00Z');

      // Esperado: NÃO é aniversário (em São Paulo ainda é 23 de agosto)
      const match1 = birthdayMatches(birthDate, now, 'America/Sao_Paulo');
      expect(match1).toBe(false);

      // Simula: 23 de agosto 22:00 UTC (23 de agosto em São Paulo)
      const now2 = new Date('2026-08-23T22:00:00Z');

      // Esperado: É aniversário
      const match2 = birthdayMatches(birthDate, now2, 'America/Sao_Paulo');
      expect(match2).toBe(true);
    });

    it('📝 Template WhatsApp para customer.recovery.inactive existe', async () => {
      const templates = new NotificationTemplateService(client);

      // Renderizar template com variáveis
      const rendered = await templates.renderWhatsApp(tenantId, 'customer.recovery.inactive', {
        customerName: 'João',
        referenceDate: '15/08/2026',
      });

      expect(rendered).not.toBeNull();
      expect(rendered).toContain('João');
      expect(rendered).toContain('15/08/2026');
      expect(rendered).toContain('Sentimos sua falta');
    });
  },
);
