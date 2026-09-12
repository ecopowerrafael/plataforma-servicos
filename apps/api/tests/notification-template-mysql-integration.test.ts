import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)(
  'templates de notificação por tenant (Etapa 13) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const service = new NotificationTemplateService(client);
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let otherTenantId: bigint;

    beforeEach(async () => {
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `tpl-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `tpl-other-${suffix}-${randomUUID().slice(0, 4)}`,
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
      await client.notificationTemplate.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
    });

    it('lista todos os tipos com o conteúdo padrão quando não há personalização', async () => {
      const { items } = await service.list(tenantId);
      expect(items).toHaveLength(8);
      expect(items.every((item) => !item.isCustom)).toBe(true);
      const confirmed = items.find((item) => item.kind === 'appointment.booking_confirmed');
      expect(confirmed?.subject).toBe('Seu agendamento foi confirmado — {{tenantName}}');
    });

    it('permite personalizar um template e reflete a personalização na listagem e na renderização', async () => {
      await service.update(tenantId, 'appointment.booking_confirmed', {
        subject: 'Confirmado: {{protocol}}',
        body: 'Oi {{customerName}}, confirmado para {{when}}.',
      });

      const { items } = await service.list(tenantId);
      const custom = items.find((item) => item.kind === 'appointment.booking_confirmed');
      expect(custom?.isCustom).toBe(true);
      expect(custom?.subject).toBe('Confirmado: {{protocol}}');

      const rendered = await service.render(tenantId, 'appointment.booking_confirmed', {
        protocol: 'AGD-000123',
        customerName: 'Maria',
        when: '10/03/2026 14:00',
      });
      expect(rendered.subject).toBe('Confirmado: ');
      expect(rendered.body).toBe('Oi Maria, confirmado para 10/03/2026 14:00.');
    });

    it('reverte para o padrão quando subject/body são enviados como null', async () => {
      await service.update(tenantId, 'appointment.reminder', {
        subject: 'Personalizado',
        body: 'Corpo personalizado',
      });
      let items = (await service.list(tenantId)).items;
      expect(items.find((item) => item.kind === 'appointment.reminder')?.isCustom).toBe(true);

      await service.update(tenantId, 'appointment.reminder', { subject: null, body: null });
      items = (await service.list(tenantId)).items;
      expect(items.find((item) => item.kind === 'appointment.reminder')?.isCustom).toBe(false);
    });

    it('isola templates por tenant — um tenant não vê nem altera o template de outro', async () => {
      await service.update(tenantId, 'appointment.booking_canceled', {
        subject: 'Só deste tenant',
        body: 'Corpo só deste tenant',
      });

      const otherItems = (await service.list(otherTenantId)).items;
      const otherCanceled = otherItems.find((item) => item.kind === 'appointment.booking_canceled');
      expect(otherCanceled?.isCustom).toBe(false);
      expect(otherCanceled?.subject).not.toBe('Só deste tenant');

      const rendered = await service.render(otherTenantId, 'appointment.booking_canceled', {
        protocol: 'AGD-1',
        customerName: 'Cliente',
        serviceName: 'Serviço',
        professionalName: 'Profissional',
        when: 'agora',
        canceledReasonLine: '',
      });
      expect(rendered.subject).not.toContain('Só deste tenant');
    });
  },
);
