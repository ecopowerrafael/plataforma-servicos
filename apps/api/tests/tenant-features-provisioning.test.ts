import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/environment.js';
import { createPrismaClient } from '../src/database/connection.js';
import {
  PlatformService,
  type PlatformAuthContext,
} from '../src/modules/platform/platform.service.js';

const client = createPrismaClient(loadEnvironment().DATABASE_URL);
const service = new PlatformService(client);
const run = randomUUID().slice(0, 8);
let tenantId: bigint | undefined;
let planId: bigint | undefined;
let actorId: bigint | undefined;
let ownerId: bigint | undefined;

afterAll(async () => {
  if (tenantId !== undefined) {
    await client.$transaction([
      client.auditLog.deleteMany({ where: { tenantId } }),
      client.subscriptionHistory.deleteMany({ where: { tenantId } }),
      client.tenantSubscription.deleteMany({ where: { tenantId } }),
      client.userInvitation.deleteMany({ where: { tenantId } }),
      client.tenantMembership.deleteMany({ where: { tenantId } }),
      client.businessUnit.deleteMany({ where: { tenantId } }),
      client.tenantFeatureOverride.deleteMany({ where: { tenantId } }),
      client.tenantCustomFieldDefinition.deleteMany({ where: { tenantId } }),
      client.tenantTerminology.deleteMany({ where: { tenantId } }),
      client.tenantBranding.deleteMany({ where: { tenantId } }),
      client.tenantSettings.deleteMany({ where: { tenantId } }),
      client.tenant.deleteMany({ where: { id: tenantId } }),
    ]);
  }
  if (planId !== undefined) await client.commercialPlan.delete({ where: { id: planId } });
  if (actorId !== undefined) await client.user.delete({ where: { id: actorId } });
  if (ownerId !== undefined) await client.user.delete({ where: { id: ownerId } });
  await client.$disconnect();
});

describe('funcionalidades no provisionamento', () => {
  it('cria defaults do perfil, salva override e registra auditoria no MySQL', async () => {
    const actor = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `feature-actor-${run}@tests.invalid`,
        normalizedEmail: `feature-actor-${run}@tests.invalid`,
        status: 'INVITED',
      },
    });
    actorId = actor.id;
    const plan = await client.commercialPlan.create({
      data: {
        publicId: randomUUID(),
        code: `FEATURE_${run.toUpperCase()}`,
        name: 'Plano temporário',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        priceCents: 1000n,
        currency: 'BRL',
      },
    });
    planId = plan.id;
    const auth: PlatformAuthContext = {
      administrator: { id: actor.id, publicId: randomUUID(), status: 'ACTIVE' },
      user: { id: actor.id, publicId: actor.publicId, email: actor.email, status: actor.status },
      permissions: [],
    };
    const ownerEmail = `feature-owner-${run}@tests.invalid`;
    const created = await service.createTenant(
      {
        legalName: 'Tenant temporário Ltda',
        displayName: 'Tenant temporário',
        slug: `features-${run}`,
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
        businessProfile: 'PSYCHOLOGY',
        settings: {
          allowMultipleUnits: false,
          defaultAppointmentIntervalMinutes: 15,
          weekStartsOn: 'MONDAY',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '24H',
        },
        initialUnit: { name: 'Matriz', slug: 'matriz' },
        ownerEmail,
        planPublicId: plan.publicId,
        billingCycle: 'MONTHLY',
        trial: false,
      },
      auth,
      { ipAddress: null, userAgent: null },
    );
    const tenant = await client.tenant.findUniqueOrThrow({
      where: { publicId: created.tenant.publicId },
    });
    tenantId = tenant.id;
    ownerId = (await client.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } })).id;
    expect((await service.getTenantFeatures(created.tenant.publicId)).features).toContainEqual(
      expect.objectContaining({ code: 'MEDICAL_RECORDS', enabled: true, source: 'PROFILE' }),
    );
    expect((await service.getTenantCustomFields(created.tenant.publicId)).fields).toContainEqual(
      expect.objectContaining({ key: 'crp', source: 'PROFILE', active: true }),
    );
    const fields = await service.createTenantCustomField(
      created.tenant.publicId,
      {
        key: 'observacao',
        label: 'Observação',
        type: 'TEXTAREA',
        scope: 'CUSTOMER',
        required: false,
        active: true,
        order: 0,
      },
      auth,
      { ipAddress: null, userAgent: null },
    );
    const custom = fields.fields.find((field) => field.key === 'observacao');
    if (custom === undefined) throw new Error('Campo temporário não criado.');
    await expect(
      service.setTenantCustomFieldActive(randomUUID(), custom.publicId, false, auth, {
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: 'PLATFORM_CUSTOM_FIELD_NOT_FOUND', statusCode: 404 });
    await service.setTenantCustomFieldActive(
      created.tenant.publicId,
      custom.publicId,
      false,
      auth,
      { ipAddress: null, userAgent: null },
    );
    expect((await service.getTenantCustomFields(created.tenant.publicId)).fields).toContainEqual(
      expect.objectContaining({ publicId: custom.publicId, active: false, source: 'OVERRIDE' }),
    );
    await service.updateTenantFeatures(
      created.tenant.publicId,
      [{ code: 'MEDICAL_RECORDS', enabled: false }],
      auth,
      { ipAddress: null, userAgent: null },
    );
    expect((await service.getTenantFeatures(created.tenant.publicId)).features).toContainEqual(
      expect.objectContaining({ code: 'MEDICAL_RECORDS', enabled: false, source: 'OVERRIDE' }),
    );
    expect(
      await client.auditLog.findFirst({
        where: { tenantId, action: 'platform.tenant.features.updated' },
      }),
    ).not.toBeNull();
    expect(
      await client.auditLog.findFirst({
        where: { tenantId, action: 'platform.tenant.custom_field.deactivated' },
      }),
    ).not.toBeNull();
  });
});
