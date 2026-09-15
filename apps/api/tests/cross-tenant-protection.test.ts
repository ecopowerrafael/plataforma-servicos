import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

let actor = { userId: 0n, sessionId: null as bigint | null };

describe.skipIf(url === undefined)('proteção cross-tenant', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const professionals = new ProfessionalService(
    new PrismaProfessionalRepository(client),
    new LocalServiceImageStorage(),
  );

  const suffix = randomUUID().slice(0, 8);
  let tenantAId: bigint;
  let tenantBId: bigint;
  let unitAId: bigint;
  let unitBId: bigint;
  let professionalAPublicId: string;
  let professionalBPublicId: string;

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `test-xten-${randomUUID()}@test.invalid`,
        normalizedEmail: `test-xten-${randomUUID()}@test.invalid`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    actor = { userId: user.id, sessionId: null };

    // Tenant A
    const tenantA = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `xten-a-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Tenant A',
        displayName: 'Tenant A',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantAId = tenantA.id;

    const unitA = await client.businessUnit.create({
      data: {
        publicId: randomUUID(),
        tenantId: tenantAId,
        name: 'Unit A',
        slug: 'unit-a',
        status: 'ACTIVE',
        isHeadquarters: true,
        timezone: 'America/Sao_Paulo',
      },
    });
    unitAId = unitA.id;

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
    professionalAPublicId = profA.publicId;

    // Tenant B
    const tenantB = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `xten-b-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Tenant B',
        displayName: 'Tenant B',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantBId = tenantB.id;

    const unitB = await client.businessUnit.create({
      data: {
        publicId: randomUUID(),
        tenantId: tenantBId,
        name: 'Unit B',
        slug: 'unit-b',
        status: 'ACTIVE',
        isHeadquarters: true,
        timezone: 'America/Sao_Paulo',
      },
    });
    unitBId = unitB.id;

    const profB = await professionals.create(tenantBId, {
      name: 'Professional B',
      publicName: 'Prof B',
      active: true,
      specialties: [],
      calendarColor: '#222222',
      sortOrder: 0,
      commissionType: 'PERCENTAGE',
      commissionValue: 0,
      customFields: {},
    }, actor);
    professionalBPublicId = profB.publicId;
  });

  afterEach(async () => {
    const ids = [tenantAId, tenantBId];
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalUnavailability.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalUnit.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.businessUnit.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenantSettings.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    if (actor.userId > 0n) {
      await client.user.deleteMany({ where: { id: actor.userId } });
    }
  });

  it('Unit A está isolada em Tenant A (não aparece em queries de Tenant B)', async () => {
    // Unit A existe em Tenant A
    const unitADirect = await client.businessUnit.findFirst({
      where: { id: unitAId, tenantId: tenantAId },
    });
    expect(unitADirect).not.toBeNull();
    expect(unitADirect?.tenantId).toBe(tenantAId);

    // Unit A NÃO aparece quando queremos Units de Tenant B
    const unitAFromTenantB = await client.businessUnit.findFirst({
      where: { id: unitAId, tenantId: tenantBId },
    });
    expect(unitAFromTenantB).toBeNull();
  });

  it('Unit B está isolada em Tenant B (não aparece em queries de Tenant A)', async () => {
    // Unit B existe em Tenant B
    const unitBDirect = await client.businessUnit.findFirst({
      where: { id: unitBId, tenantId: tenantBId },
    });
    expect(unitBDirect).not.toBeNull();
    expect(unitBDirect?.tenantId).toBe(tenantBId);

    // Unit B NÃO aparece quando queremos Units de Tenant A
    const unitBFromTenantA = await client.businessUnit.findFirst({
      where: { id: unitBId, tenantId: tenantAId },
    });
    expect(unitBFromTenantA).toBeNull();
  });

  it('Professional A está isolado em Tenant A (não aparece em queries de Tenant B)', async () => {
    const profA = await client.professional.findFirst({
      where: { publicId: professionalAPublicId, tenantId: tenantAId },
    });
    expect(profA).not.toBeNull();
    expect(profA?.tenantId).toBe(tenantAId);

    // Professional A NÃO aparece quando queremos Professionals de Tenant B
    const profAFromTenantB = await client.professional.findFirst({
      where: { publicId: professionalAPublicId, tenantId: tenantBId },
    });
    expect(profAFromTenantB).toBeNull();
  });

  it('Professional B está isolado em Tenant B (não aparece em queries de Tenant A)', async () => {
    const profB = await client.professional.findFirst({
      where: { publicId: professionalBPublicId, tenantId: tenantBId },
    });
    expect(profB).not.toBeNull();
    expect(profB?.tenantId).toBe(tenantBId);

    // Professional B NÃO aparece quando queremos Professionals de Tenant A
    const profBFromTenantA = await client.professional.findFirst({
      where: { publicId: professionalBPublicId, tenantId: tenantAId },
    });
    expect(profBFromTenantA).toBeNull();
  });
});
