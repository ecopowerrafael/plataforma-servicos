import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('Professional Active Bug — BUG 2', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  const images = new LocalServiceImageStorage(undefined, 'professional');
  const repository = new PrismaProfessionalRepository(client);
  const service = new ProfessionalService(repository, images);

  beforeEach(async () => {
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `professional-test-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Professional Test',
        displayName: 'Professional Test',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await Promise.all([
      client.professionalCommission.deleteMany({
        where: { professional: { tenantId } },
      }),
      client.professionalWorkSchedule.deleteMany({
        where: { professional: { tenantId } },
      }),
      client.professionalUnavailability.deleteMany({
        where: { professional: { tenantId } },
      }),
      client.professionalService.deleteMany({
        where: { professional: { tenantId } },
      }),
      client.professionalUnit.deleteMany({
        where: { professional: { tenantId } },
      }),
    ]);
    await client.professional.deleteMany({ where: { tenantId } });
    await client.tenant.deleteMany({ where: { id: tenantId } });
  });

  describe('CREATE Professional', () => {
    it('✅ Criar profissional SEM especificar active → active deve ser true por padrão', async () => {
      const input = {
        name: 'Test Professional',
        publicName: 'Test Pro',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
        // NÃO enviar active
      };

      const created = await service.create(tenantId, input as any);

      expect(created.active).toBe(true);
    });

    it('✅ Criar profissional COM active:true → deve ser true', async () => {
      const input = {
        name: 'Active Professional',
        publicName: 'Active Pro',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: true,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      };

      const created = await service.create(tenantId, input);

      expect(created.active).toBe(true);
    });

    it('✅ Criar profissional COM active:false → deve ser false', async () => {
      const input = {
        name: 'Inactive Professional',
        publicName: 'Inactive Pro',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: false,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      };

      const created = await service.create(tenantId, input);

      expect(created.active).toBe(false);
    });
  });

  describe('UPDATE Professional', () => {
    it('✅ Atualizar profissional ATIVO omitindo active → continua true', async () => {
      const created = await service.create(tenantId, {
        name: 'Original Name',
        publicName: 'Original',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: true,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Updated Name',
        publicName: 'Updated',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
        // NÃO enviar active
      } as any);

      expect(updated.active).toBe(true);
    });

    it('✅ Atualizar profissional INATIVO omitindo active → continua false', async () => {
      const created = await service.create(tenantId, {
        name: 'Inactive Professional',
        publicName: 'Inactive',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: false,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Still Inactive',
        publicName: 'Still Inactive',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
        // NÃO enviar active
      } as any);

      expect(updated.active).toBe(false);
    });

    it('✅ Atualizar profissional ativo enviando active:false → deve ficar false', async () => {
      const created = await service.create(tenantId, {
        name: 'Professional to Deactivate',
        publicName: 'Deactivate',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: true,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Professional to Deactivate',
        publicName: 'Deactivate',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: false,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      });

      expect(updated.active).toBe(false);
    });

    it('✅ Atualizar profissional inativo enviando active:true → deve ficar true', async () => {
      const created = await service.create(tenantId, {
        name: 'Professional to Activate',
        publicName: 'Activate',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: false,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      });

      const updated = await service.update(tenantId, created.publicId, {
        name: 'Professional to Activate',
        publicName: 'Activate',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: true,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 0,
        customFields: {},
      });

      expect(updated.active).toBe(true);
    });
  });
});
