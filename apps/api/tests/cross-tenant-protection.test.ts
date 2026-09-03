import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PrismaTenantRepository } from '../src/modules/tenants/tenant.repository.js';
import { TenantService } from '../src/modules/tenants/tenant.service.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { PrismaProfessionalUnitLinkRepository } from '../src/modules/professionals/professional-unit.repository.js';
import { ProfessionalUnitLinkService } from '../src/modules/professionals/professional-unit.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
const actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('proteção cross-tenant', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const tenants = new TenantService(new PrismaTenantRepository(client));
  const professionals = new ProfessionalService(
    new PrismaProfessionalRepository(client),
    new LocalServiceImageStorage(),
  );
  const professionalUnitLinks = new ProfessionalUnitLinkService(
    new PrismaProfessionalUnitLinkRepository(client),
  );

  const suffix = randomUUID().slice(0, 8);
  let tenantAId: bigint;
  let tenantAPublicId: string;
  let tenantAUnitPublicId: string;
  let tenantAProfessionalPublicId: string;

  let tenantBId: bigint;
  let tenantBPublicId: string;
  let tenantBUnitPublicId: string;
  let tenantBProfessionalPublicId: string;

  beforeEach(async () => {
    const tenantAResult = await tenants.createTenant({
      legalName: 'Tenant A',
      displayName: 'Tenant A',
      slug: `tenant-a-${suffix}`,
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      initialUnit: { name: 'Matriz A', slug: 'matriz-a' },
    });

    tenantAPublicId = tenantAResult.tenant.publicId;
    tenantAId = (await client.tenant.findFirstOrThrow({
      where: { publicId: tenantAPublicId },
    })).id;
    tenantAUnitPublicId = tenantAResult.initialUnit.publicId;

    const profA = await professionals.create(tenantAId, {
      name: 'Professional A',
      publicName: 'Prof A',
      active: true,
      specialties: [],
      calendarColor: '#111111',
      sortOrder: 0,
      commissionType: 'PERCENTAGE',
      commissionValue: 0,
      customFields: {},
    }, actor);
    tenantAProfessionalPublicId = profA.publicId;

    const tenantBResult = await tenants.createTenant({
      legalName: 'Tenant B',
      displayName: 'Tenant B',
      slug: `tenant-b-${suffix}`,
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      initialUnit: { name: 'Matriz B', slug: 'matriz-b' },
    });

    tenantBPublicId = tenantBResult.tenant.publicId;
    tenantBId = (await client.tenant.findFirstOrThrow({
      where: { publicId: tenantBPublicId },
    })).id;
    tenantBUnitPublicId = tenantBResult.initialUnit.publicId;

    const profB = await professionals.create(tenantBId, {
      name: 'Professional B',
      publicName: 'Prof B',
      active: true,
      specialties: [],
      calendarColor: '#111111',
      sortOrder: 0,
      commissionType: 'PERCENTAGE',
      commissionValue: 0,
      customFields: {},
    }, actor);
    tenantBProfessionalPublicId = profB.publicId;
  });

  afterEach(async () => {
    const ids = [tenantAId, tenantBId];
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalUnitLink.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.businessUnit.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenantSettings.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
  });

  it('Unit de tenant B rejeita acesso de tenant A', async () => {
    await expect(
      professionalUnitLinks.listUnit(tenantAId, tenantBUnitPublicId),
    ).rejects.toMatchObject({
      code: 'PROFESSIONAL_UNIT_NOT_FOUND',
    });
  });

  it('Professional de tenant B rejeita vínculo com Unit de tenant A', async () => {
    await expect(
      professionalUnitLinks.upsert(
        tenantBId,
        tenantBProfessionalPublicId,
        { unitPublicId: tenantAUnitPublicId, active: true },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'PROFESSIONAL_UNIT_NOT_FOUND',
    });
  });

  it('Professional de tenant A rejeita vínculo com Unit de tenant B', async () => {
    await expect(
      professionalUnitLinks.upsert(
        tenantAId,
        tenantAProfessionalPublicId,
        { unitPublicId: tenantBUnitPublicId, active: true },
        actor,
      ),
    ).rejects.toMatchObject({
      code: 'PROFESSIONAL_UNIT_NOT_FOUND',
    });
  });

  it('Permite vínculo quando ambos pertencem ao mesmo tenant', async () => {
    const result = await professionalUnitLinks.upsert(
      tenantAId,
      tenantAProfessionalPublicId,
      { unitPublicId: tenantAUnitPublicId, active: true },
      actor,
    );

    expect(result.professionalPublicId).toBe(tenantAProfessionalPublicId);
    expect(result.unitPublicId).toBe(tenantAUnitPublicId);
    expect(result.active).toBe(true);
  });
});
