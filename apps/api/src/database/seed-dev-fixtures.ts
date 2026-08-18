import { resolve } from 'node:path';

import { config } from 'dotenv';

import { createPrismaClient } from './connection.js';
import { buildDatabaseUrl } from '../config/database-url.js';
import { PasswordService } from '../modules/auth/password.service.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Fixtures de desenvolvimento não podem ser executados em produção.');
}

const adminEmail = 'admin@agendei.local';
const ownerEmail = 'owner@agendei.local';
const password = 'Agendei@123456';
const tenantSlug = 'agendei-teste-local';
const fixtureIds = {
  adminUser: '10000000-0000-4000-8000-000000000001',
  ownerUser: '10000000-0000-4000-8000-000000000002',
  administrator: '10000000-0000-4000-8000-000000000003',
  tenant: '10000000-0000-4000-8000-000000000004',
  unit: '10000000-0000-4000-8000-000000000005',
  membership: '10000000-0000-4000-8000-000000000006',
  plan: '10000000-0000-4000-8000-000000000007',
  billingOption: '10000000-0000-4000-8000-000000000008',
  subscription: '10000000-0000-4000-8000-000000000009',
  tenantRole: '10000000-0000-4000-8000-000000000010',
} as const;

const platformPermissions = [
  'platform.dashboard.read',
  'platform.tenant.read',
  'platform.tenant.create',
  'platform.tenant.update',
  'platform.tenant.status.manage',
  'platform.plan.read',
  'platform.plan.create',
  'platform.plan.update',
  'platform.plan.status.manage',
  'platform.subscription.read',
  'platform.subscription.create',
  'platform.subscription.update',
  'platform.subscription.status.manage',
  'platform.audit.read',
  'platform.metrics.read',
] as const;

const tenantPermissions = ['tenant.read', 'tenant.update', 'tenant.subscription.read'] as const;

const databaseUrl = buildDatabaseUrl(process.env);
if (databaseUrl === undefined) {
  throw new Error('Configuração de banco ausente para as fixtures de desenvolvimento.');
}

const passwords = new PasswordService({
  memoryCost: Number(process.env.PASSWORD_ARGON2_MEMORY_COST) || 65_536,
  timeCost: Number(process.env.PASSWORD_ARGON2_TIME_COST) || 3,
  parallelism: Number(process.env.PASSWORD_ARGON2_PARALLELISM) || 1,
});
const client = createPrismaClient(databaseUrl);

try {
  const passwordHash = await passwords.hash(password);
  const now = new Date();
  const periodEndsAt = new Date(now);
  periodEndsAt.setUTCMonth(periodEndsAt.getUTCMonth() + 1);

  const plan =
    (await client.commercialPlan.findFirst({
      where: { status: 'ACTIVE', isPublic: true },
      orderBy: { sortOrder: 'asc' },
      include: { billingOptions: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
    })) ??
    (await client.commercialPlan.create({
      data: {
        publicId: fixtureIds.plan,
        code: 'DEV_LOCAL',
        name: 'Plano Desenvolvimento Local',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        priceCents: 4_900n,
        currency: 'BRL',
        isPublic: true,
        sortOrder: 9_999,
        billingOptions: {
          create: {
            publicId: fixtureIds.billingOption,
            billingCycle: 'MONTHLY',
            priceCents: 4_900n,
            active: true,
            sortOrder: 0,
            recommended: true,
          },
        },
      },
      include: { billingOptions: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
    }));
  const billingOption = plan.billingOptions[0];
  if (billingOption === undefined) {
    throw new Error('O plano de desenvolvimento não possui uma opção de cobrança ativa.');
  }

  const [admin, owner] = await Promise.all([
    client.user.upsert({
      where: { normalizedEmail: adminEmail },
      create: {
        publicId: fixtureIds.adminUser,
        email: adminEmail,
        normalizedEmail: adminEmail,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: now,
      },
      update: { email: adminEmail, passwordHash, status: 'ACTIVE', emailVerifiedAt: now },
    }),
    client.user.upsert({
      where: { normalizedEmail: ownerEmail },
      create: {
        publicId: fixtureIds.ownerUser,
        email: ownerEmail,
        normalizedEmail: ownerEmail,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: now,
      },
      update: { email: ownerEmail, passwordHash, status: 'ACTIVE', emailVerifiedAt: now },
    }),
  ]);

  const tenant = await client.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      publicId: fixtureIds.tenant,
      slug: tenantSlug,
      legalName: 'Agendei Teste Local Ltda.',
      displayName: 'Agendei Teste Local',
      status: 'ACTIVE',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      settings: { create: {} },
    },
    update: {
      legalName: 'Agendei Teste Local Ltda.',
      displayName: 'Agendei Teste Local',
      status: 'ACTIVE',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      settings: { upsert: { create: {}, update: {} } },
    },
  });

  const [tenantRole, platformRole] = await Promise.all([
    client.role.upsert({
      where: { code: 'DEV_LOCAL_OWNER' },
      create: {
        publicId: fixtureIds.tenantRole,
        tenantId: tenant.id,
        code: 'DEV_LOCAL_OWNER',
        name: 'Proprietário de desenvolvimento',
        description: 'Acesso local para fixtures de desenvolvimento.',
        isSystem: false,
      },
      update: { tenantId: tenant.id },
    }),
    client.platformRole.upsert({
      where: { code: 'PLATFORM_ADMIN' },
      create: {
        code: 'PLATFORM_ADMIN',
        name: 'Administrador da plataforma',
        description: 'Administração global da plataforma.',
        isSystem: true,
      },
      update: {},
    }),
  ]);
  const [tenantPermissionRows, platformPermissionRows] = await Promise.all([
    Promise.all(
      tenantPermissions.map((code) =>
        client.permission.upsert({ where: { code }, create: { code, description: code }, update: {} }),
      ),
    ),
    Promise.all(
      platformPermissions.map((code) =>
        client.platformPermission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        }),
      ),
    ),
  ]);
  await Promise.all([
    client.rolePermission.createMany({
      data: tenantPermissionRows.map((permission) => ({ roleId: tenantRole.id, permissionId: permission.id })),
      skipDuplicates: true,
    }),
    client.platformRolePermission.createMany({
      data: platformPermissionRows.map((permission) => ({ roleId: platformRole.id, permissionId: permission.id })),
      skipDuplicates: true,
    }),
  ]);

  await client.businessUnit.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'matriz' } },
    create: {
      publicId: fixtureIds.unit,
      tenantId: tenant.id,
      name: 'Matriz',
      slug: 'matriz',
      status: 'ACTIVE',
      isHeadquarters: true,
      timezone: tenant.timezone,
    },
    update: { name: 'Matriz', status: 'ACTIVE', isHeadquarters: true, timezone: tenant.timezone },
  });
  await client.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
    create: {
      publicId: fixtureIds.membership,
      tenantId: tenant.id,
      userId: owner.id,
      roleId: tenantRole.id,
      status: 'ACTIVE',
      isOwner: true,
      allUnits: true,
      joinedAt: now,
    },
    update: { roleId: tenantRole.id, status: 'ACTIVE', isOwner: true, allUnits: true, joinedAt: now },
  });
  const administrator = await client.platformAdministrator.upsert({
    where: { userId: admin.id },
    create: { publicId: fixtureIds.administrator, userId: admin.id, status: 'ACTIVE' },
    update: { status: 'ACTIVE' },
  });
  await client.platformAdministratorRole.createMany({
    data: [{ administratorId: administrator.id, roleId: platformRole.id }],
    skipDuplicates: true,
  });

  const effective = await client.tenantSubscription.findFirst({
    where: { tenantId: tenant.id, effectiveKey: 'EFFECTIVE' },
  });
  if (effective === null) {
    await client.tenantSubscription.create({
      data: {
        publicId: fixtureIds.subscription,
        tenantId: tenant.id,
        planId: plan.id,
        status: 'ACTIVE',
        startsAt: now,
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: periodEndsAt,
        priceCents: billingOption.priceCents,
        currency: plan.currency,
        billingCycle: billingOption.billingCycle,
        effectiveKey: 'EFFECTIVE',
      },
    });
  } else {
    await client.tenantSubscription.update({
      where: { id: effective.id },
      data: {
        planId: plan.id,
        status: 'ACTIVE',
        startsAt: now,
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: periodEndsAt,
        priceCents: billingOption.priceCents,
        currency: plan.currency,
        billingCycle: billingOption.billingCycle,
        effectiveKey: 'EFFECTIVE',
      },
    });
  }

  process.stdout.write(
    `Dev fixtures ready\n\nPlatform admin: ${adminEmail}\nTenant owner: ${ownerEmail}\nTenant: ${tenantSlug}\nPassword: ${password}\n`,
  );
} finally {
  await client.$disconnect();
}
