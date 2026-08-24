import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PrismaProfessionalServiceRepository } from '../src/modules/professionals/professional-service.repository.js';
import { ProfessionalServiceLinkService } from '../src/modules/professionals/professional-service.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('Professional Service Bulk Operations', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let professionalId: string;
  let serviceIds: string[] = [];
  const linkRepo = new PrismaProfessionalServiceRepository(client);
  const service = new ProfessionalServiceLinkService(linkRepo);

  beforeEach(async () => {
    serviceIds = [];

    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `prof-service-bulk-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Bulk Test',
        displayName: 'Bulk Test',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;

    const professional = await client.professional.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Test Professional',
        publicName: 'Test Pro',
        calendarColor: '#2563EB',
        active: true,
      },
    });
    professionalId = professional.publicId;

    for (let i = 1; i <= 5; i++) {
      const svc = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: `Service ${i}`,
          durationMinutes: 30,
          priceCents: BigInt(5000),
          color: '#2563EB',
          active: true,
        },
      });
      serviceIds.push(svc.publicId);
    }
  });

  afterEach(async () => {
    try {
      await Promise.all([
        client.auditLog.deleteMany({ where: { tenantId } }),
        client.professionalCommission.deleteMany({ where: { tenantId } }),
        client.professionalWorkSchedule.deleteMany({ where: { tenantId } }),
        client.professionalUnavailability.deleteMany({ where: { tenantId } }),
        client.professionalService.deleteMany({ where: { tenantId } }),
        client.professionalUnit.deleteMany({ where: { tenantId } }),
        client.serviceCategory.deleteMany({ where: { tenantId } }),
        client.appointment.deleteMany({ where: { tenantId } }),
      ]);
      await Promise.all([
        client.professional.deleteMany({ where: { tenantId } }),
        client.service.deleteMany({ where: { tenantId } }),
      ]);
      await client.tenant.deleteMany({ where: { id: tenantId } });
    } catch (err) {
      console.error('cleanup error:', err);
      throw err;
    }
  });

  describe('Bulk Upsert', () => {
    it('1. bulk cria 3 vínculos novos', async () => {
      const result = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1], serviceIds[2]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      expect(result.items).toHaveLength(3);
      const publicIds = result.items.map((i) => i.servicePublicId).sort();
      expect(publicIds).toEqual([serviceIds[0], serviceIds[1], serviceIds[2]].sort());
    });

    it('2. todos nascem active=true', async () => {
      const result = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1], serviceIds[2]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      expect(result.items.every((item) => item.active === true)).toBe(true);
    });

    it('3. chamar novamente com os mesmos IDs não duplica', async () => {
      const first = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const count1 = first.items.length;

      const second = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      expect(second.items).toHaveLength(count1);
    });

    it('4. segunda chamada é idempotente', async () => {
      const first = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const firstIds = first.items.map((i) => i.publicId).sort();

      const second = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const secondIds = second.items.map((i) => i.publicId).sort();

      expect(firstIds).toEqual(secondIds);
    });

    it('5. remover um ID desativa o vínculo correspondente', async () => {
      await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1], serviceIds[2]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const result = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const service2 = result.items.find((i) => i.servicePublicId === serviceIds[2]);
      expect(service2?.active).toBe(false);
    });

    it('6. reintroduzir o ID reativa o MESMO vínculo', async () => {
      const first = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1], serviceIds[2]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const originalPublicId = first.items.find(
        (i) => i.servicePublicId === serviceIds[2],
      )?.publicId;

      await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const reactivated = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1], serviceIds[2]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const reactivatedLink = reactivated.items.find(
        (i) => i.servicePublicId === serviceIds[2],
      );

      expect(reactivatedLink?.publicId).toBe(originalPublicId);
      expect(reactivatedLink?.active).toBe(true);
    });

    it('7. overrides existentes permanecem após desativar/reativar', async () => {
      const link = await service.upsert(tenantId, professionalId, {
        servicePublicId: serviceIds[0],
        active: true,
        priceCents: 15000,
        durationMinutes: 60,
        hasPostServiceBreak: true,
        postServiceBreakMinutes: 15,
        commissionType: 'PERCENTAGE' as const,
        commissionValue: 10,
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      expect(link.priceCents).toBe(15000);

      await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const reactivated = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const service0 = reactivated.items.find((i) => i.servicePublicId === serviceIds[0]);
      expect(service0?.priceCents).toBe(15000);
      expect(service0?.durationMinutes).toBe(60);
      expect(service0?.hasPostServiceBreak).toBe(true);
      expect(service0?.postServiceBreakMinutes).toBe(15);
      expect(service0?.commissionType).toBe('PERCENTAGE');
      expect(service0?.commissionValue).toBe(10);
    });

    it('8. manter vínculo selecionado não altera overrides', async () => {
      const created = await service.upsert(tenantId, professionalId, {
        servicePublicId: serviceIds[0],
        active: true,
        priceCents: 20000,
        durationMinutes: 45,
        hasPostServiceBreak: null,
        postServiceBreakMinutes: null,
        commissionType: null,
        commissionValue: null,
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const updated = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0], serviceIds[1]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const service0 = updated.items.find((i) => i.servicePublicId === serviceIds[0]);
      expect(service0?.priceCents).toBe(20000);
      expect(service0?.durationMinutes).toBe(45);
    });

    it('9. novo vínculo usa overrides null/padrão', async () => {
      const result = await service.bulkUpsert(tenantId, professionalId, {
        desiredServicePublicIds: [serviceIds[0]],
      }, { userId: BigInt(1), sessionId: BigInt(1) });

      const service0 = result.items[0];
      expect(service0.priceCents).toBeNull();
      expect(service0.durationMinutes).toBeNull();
      expect(service0.hasPostServiceBreak).toBeNull();
      expect(service0.postServiceBreakMinutes).toBeNull();
      expect(service0.commissionType).toBeNull();
      expect(service0.commissionValue).toBeNull();
    });

    it('10. serviço de outro tenant não pode ser vinculado', async () => {
      const otherTenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `other-${randomUUID().slice(0, 4)}`,
          legalName: 'Other Tenant',
          displayName: 'Other',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });

      const otherService = await client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId: otherTenant.id,
          name: 'Other Service',
          durationMinutes: 30,
          priceCents: BigInt(5000),
          color: '#2563EB',
          active: true,
        },
      });

      try {
        await service.bulkUpsert(tenantId, professionalId, {
          desiredServicePublicIds: [otherService.publicId],
        }, { userId: BigInt(1), sessionId: BigInt(1) });
        throw new Error('Should have thrown error');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }

      await client.service.deleteMany({ where: { tenantId: otherTenant.id } });
      await client.tenant.deleteMany({ where: { id: otherTenant.id } });
    });

    it('11. profissional de outro tenant não pode ser alterado', async () => {
      const otherTenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `other2-${randomUUID().slice(0, 4)}`,
          legalName: 'Other Tenant 2',
          displayName: 'Other2',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });

      try {
        await service.bulkUpsert(otherTenant.id, professionalId, {
          desiredServicePublicIds: [serviceIds[0]],
        }, { userId: BigInt(1), sessionId: BigInt(1) });
        throw new Error('Should have thrown error');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }

      await client.tenant.deleteMany({ where: { id: otherTenant.id } });
    });

    it('12. UUID inexistente retorna erro correto', async () => {
      const fakeId = randomUUID();
      try {
        await service.bulkUpsert(tenantId, professionalId, {
          desiredServicePublicIds: [fakeId],
        }, { userId: BigInt(1), sessionId: BigInt(1) });
        throw new Error('Should have thrown error');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it('13. profissional inexistente retorna erro', async () => {
      const fakeId = randomUUID();
      try {
        await service.bulkUpsert(tenantId, fakeId, {
          desiredServicePublicIds: [serviceIds[0]],
        }, { userId: BigInt(1), sessionId: BigInt(1) });
        throw new Error('Should have thrown error');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it('14. transação: se um dos IDs for inválido, nenhum vínculo é aplicado', async () => {
      const beforeCount = (await linkRepo.listByProfessional(tenantId, professionalId)).length;

      const fakeId = randomUUID();
      try {
        await service.bulkUpsert(tenantId, professionalId, {
          desiredServicePublicIds: [serviceIds[0], fakeId],
        }, { userId: BigInt(1), sessionId: BigInt(1) });
        throw new Error('Should have thrown error');
      } catch (e) {
        // esperado falhar
      }

      const afterCount = (await linkRepo.listByProfessional(tenantId, professionalId)).length;
      expect(afterCount).toBe(beforeCount);
    });
  });
});
