import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PrismaServiceRepository } from '../src/modules/services/service.repository.js';
import { ServiceService } from '../src/modules/services/service.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('Service Active Bug — BUG 1', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  const storage = new LocalServiceImageStorage();
  const repository = new PrismaServiceRepository(client);
  const service = new ServiceService(repository, storage);

  beforeEach(async () => {
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `service-test-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Service Test',
        displayName: 'Service Test',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await client.service.deleteMany({ where: { tenantId } });
    await client.tenant.deleteMany({ where: { id: tenantId } });
  });

  describe('CREATE Service', () => {
    it('✅ A criar serviço SEM especificar active → active deve ser true por padrão', async () => {
      const input = {
        name: 'Test Service',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        color: '#2563EB',
        sortOrder: 0,
        // NÃO enviar active
      };

      const created = await service.create(tenantId, input as any);

      expect(created.active).toBe(true);
    });

    it('✅ Criar serviço COM active:true → deve ser true', async () => {
      const input = {
        name: 'Active Service',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: true,
        color: '#2563EB',
        sortOrder: 0,
      };

      const created = await service.create(tenantId, input);

      expect(created.active).toBe(true);
    });

    it('✅ Criar serviço COM active:false → deve ser false', async () => {
      const input = {
        name: 'Inactive Service',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: false,
        color: '#2563EB',
        sortOrder: 0,
      };

      const created = await service.create(tenantId, input);

      expect(created.active).toBe(false);
    });
  });

  describe('UPDATE Service', () => {
    it('✅ Atualizar serviço ATIVO omitindo active → continua true', async () => {
      const created = await service.create(tenantId, {
        name: 'Original Name',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: true,
        color: '#2563EB',
        sortOrder: 0,
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Updated Name',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 45,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 6000,
        color: '#2563EB',
        sortOrder: 0,
        // NÃO enviar active
      } as any);

      expect(updated.active).toBe(true);
    });

    it('✅ Atualizar serviço INATIVO omitindo active → continua false', async () => {
      const created = await service.create(tenantId, {
        name: 'Inactive Service',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: false,
        color: '#2563EB',
        sortOrder: 0,
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Still Inactive',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 60,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 7000,
        color: '#2563EB',
        sortOrder: 0,
        // NÃO enviar active
      } as any);

      expect(updated.active).toBe(false);
    });

    it('✅ Atualizar serviço ativo enviando active:false → deve ficar false', async () => {
      const created = await service.create(tenantId, {
        name: 'Service to Deactivate',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: true,
        color: '#2563EB',
        sortOrder: 0,
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Service to Deactivate',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: false,
        color: '#2563EB',
        sortOrder: 0,
      });

      expect(updated.active).toBe(false);
    });

    it('✅ Atualizar serviço inativo enviando active:true → deve ficar true', async () => {
      const created = await service.create(tenantId, {
        name: 'Service to Activate',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: false,
        color: '#2563EB',
        sortOrder: 0,
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Service to Activate',
        description: null,
        imageAlt: null,
        iconKey: null,
        categoryPublicId: null,
        durationMinutes: 30,
        hasPostServiceBreak: false,
        postServiceBreakMinutes: 0,
        priceCents: 5000,
        active: true,
        color: '#2563EB',
        sortOrder: 0,
      });

      expect(updated.active).toBe(true);
    });
  });
});
