import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { PrismaProfessionalServiceRepository } from '../src/modules/professionals/professional-service.repository.js';
import { ProfessionalServiceLinkService } from '../src/modules/professionals/professional-service.service.js';
import { PrismaProfessionalRepository } from '../src/modules/professionals/professional.repository.js';
import { ProfessionalService } from '../src/modules/professionals/professional.service.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('comissões do próprio profissional com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const professionals = new ProfessionalService(
    new PrismaProfessionalRepository(client),
    new LocalServiceImageStorage(),
  );
  const professionalServices = new ProfessionalServiceLinkService(
    new PrismaProfessionalServiceRepository(client),
  );
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let roleId: bigint;
  let staffUserId: bigint;
  let adminUserId: bigint;
  let serviceAId = '';
  let serviceBId = '';
  const professionalInput = (
    userPublicId: string | null,
    commissionType: 'PERCENTAGE' | 'FIXED',
    commissionValue: number,
  ) => ({
    name: 'Profissional',
    publicName: 'Profissional',
    bio: null,
    phone: null,
    email: null,
    professionalDocument: null,
    specialties: [],
    calendarColor: '#111111',
    sortOrder: 0,
    active: true,
    primaryUnitPublicId: null,
    userPublicId,
    commissionType,
    commissionValue,
    customFields: {},
  });

  beforeEach(async () => {
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `profcomm-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Teste',
        displayName: 'Teste',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    const role = await client.role.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        code: `PROFESSIONAL_${suffix}`,
        name: 'Profissional',
        description: 'Teste',
        isSystem: false,
      },
    });
    roleId = role.id;
    const staffUser = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `profcomm-${randomUUID()}@test.invalid`,
        normalizedEmail: `profcomm-${randomUUID()}@test.invalid`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    staffUserId = staffUser.id;
    await client.tenantMembership.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: staffUserId,
        roleId,
        status: 'ACTIVE',
        isOwner: false,
      },
    });
    const adminUser = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `profcomm-admin-${randomUUID()}@test.invalid`,
        normalizedEmail: `profcomm-admin-${randomUUID()}@test.invalid`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    const adminSession = await client.userSession.create({
      data: {
        publicId: randomUUID(),
        userId: adminUser.id,
        tokenHash: randomUUID().replaceAll('-', ''),
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSeenAt: new Date(),
      },
    });
    adminUserId = adminUser.id;
    actor = { userId: adminUser.id, sessionId: adminSession.id };
    const [serviceA, serviceB] = await Promise.all([
      client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Corte',
          durationMinutes: 30,
          priceCents: 5000n,
          color: '#111111',
        },
      }),
      client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Coloração',
          durationMinutes: 90,
          priceCents: 20000n,
          color: '#222222',
        },
      }),
    ]);
    serviceAId = serviceA.publicId;
    serviceBId = serviceB.publicId;
  });

  afterEach(async () => {
    const ids = [tenantId];
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenantMembership.deleteMany({ where: { tenantId: { in: ids } } });
    await client.role.deleteMany({ where: { id: roleId } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    await client.userSession.deleteMany({ where: { userId: adminUserId } });
    await client.user.deleteMany({ where: { id: { in: [staffUserId, adminUserId] } } });
  });

  it('exibe a regra padrão de comissão do profissional quando não há serviços vinculados', async () => {
    const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
    await professionals.create(
      tenantId,
      professionalInput(staffUser.publicId, 'PERCENTAGE', 40),
      actor,
    );
    const me = await professionals.me(tenantId, staffUserId);

    const result = await professionalServices.commissions(tenantId, me.publicId, {
      type: me.commissionType,
      value: me.commissionValue,
    });

    expect(result).toMatchObject({
      defaultCommissionType: 'PERCENTAGE',
      defaultCommissionValue: 40,
    });
    expect(result.services).toHaveLength(0);
  });

  it('calcula a comissão efetiva por serviço: herdada do padrão quando não há override e o valor específico quando houver', async () => {
    const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
    const linked = await professionals.create(
      tenantId,
      professionalInput(staffUser.publicId, 'PERCENTAGE', 30),
      actor,
    );
    await professionalServices.upsert(
      tenantId,
      linked.publicId,
      { servicePublicId: serviceAId, active: true },
      actor,
    );
    await professionalServices.upsert(
      tenantId,
      linked.publicId,
      { servicePublicId: serviceBId, commissionType: 'FIXED', commissionValue: 1500, active: true },
      actor,
    );
    const me = await professionals.me(tenantId, staffUserId);

    const result = await professionalServices.commissions(tenantId, me.publicId, {
      type: me.commissionType,
      value: me.commissionValue,
    });

    const withoutOverride = result.services.find((item) => item.servicePublicId === serviceAId);
    const withOverride = result.services.find((item) => item.servicePublicId === serviceBId);

    expect(withoutOverride).toMatchObject({
      serviceName: 'Corte',
      overrideCommissionType: null,
      overrideCommissionValue: null,
      effectiveCommissionType: 'PERCENTAGE',
      effectiveCommissionValue: 30,
    });
    expect(withOverride).toMatchObject({
      serviceName: 'Coloração',
      overrideCommissionType: 'FIXED',
      overrideCommissionValue: 1500,
      effectiveCommissionType: 'FIXED',
      effectiveCommissionValue: 1500,
    });
  });

  it('isola as comissões: um profissional não visualiza a regra padrão nem os serviços vinculados de outro', async () => {
    const staffUser = await client.user.findUniqueOrThrow({ where: { id: staffUserId } });
    await professionals.create(
      tenantId,
      professionalInput(staffUser.publicId, 'PERCENTAGE', 25),
      actor,
    );
    const other = await professionals.create(
      tenantId,
      professionalInput(null, 'FIXED', 5000),
      actor,
    );
    await professionalServices.upsert(
      tenantId,
      other.publicId,
      { servicePublicId: serviceAId, commissionType: 'FIXED', commissionValue: 9999, active: true },
      actor,
    );

    const me = await professionals.me(tenantId, staffUserId);
    const result = await professionalServices.commissions(tenantId, me.publicId, {
      type: me.commissionType,
      value: me.commissionValue,
    });

    expect(result.defaultCommissionType).toBe('PERCENTAGE');
    expect(result.defaultCommissionValue).toBe(25);
    expect(result.services).toHaveLength(0);
    expect(result.services.some((item) => item.servicePublicId === serviceAId)).toBe(false);
  });
});
