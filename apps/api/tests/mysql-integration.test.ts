import { randomBytes, randomUUID } from 'node:crypto';

import {
  ErrorResponseSchema,
  SuccessResponseSchema,
  TenantUnitsResponseSchema,
} from '@plataforma/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { type Environment } from '../src/config/environment.js';
import { createDatabaseConnection, createPrismaClient } from '../src/database/connection.js';
import { CapturingAccountMessageDelivery } from '../src/modules/auth/message-delivery.js';

const databaseUrl = process.env.MYSQL_INTEGRATION_DATABASE_URL;
const integrationEnabled = databaseUrl !== undefined;

function secret(): string {
  return `Teste-${randomBytes(18).toString('base64url')}9`;
}

function authCookie(response: {
  headers: Record<string, number | string | string[] | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  if (typeof header !== 'string') throw new Error('Cookie de sessÃ£o ausente.');
  const cookie = header.split(';', 1)[0];
  if (cookie === undefined) throw new Error('Cookie de sessÃ£o invÃ¡lido.');
  return cookie;
}

describe.skipIf(!integrationEnabled)('integraÃ§Ã£o com MySQL 8', () => {
  const url = databaseUrl ?? 'mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos';
  const client = createPrismaClient(url);
  const connection = createDatabaseConnection(url);
  const delivery = new CapturingAccountMessageDelivery();
  const environment: Environment = {
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: 3100,
    DATABASE_URL: url,
    CORS_ORIGINS: ['http://127.0.0.1:5174'],
    LOG_LEVEL: 'silent',
    APP_WEB_URL: 'http://127.0.0.1:5174',
    AUTH_COOKIE_NAME: 'ps_session',
    AUTH_SESSION_TTL_HOURS: 24,
    AUTH_MAX_ACTIVE_SESSIONS: 3,
    AUTH_COOKIE_SECURE: false,
    PASSWORD_ARGON2_MEMORY_COST: 19_456,
    PASSWORD_ARGON2_TIME_COST: 2,
    PASSWORD_ARGON2_PARALLELISM: 1,
    LOGIN_RATE_LIMIT_MAX: 100,
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: 1,
    PASSWORD_RESET_TTL_MINUTES: 30,
    INVITATION_TTL_HOURS: 24,
    SMTP_PORT: 587,
    SMTP_SECURE: false,
  };
  let app: Awaited<ReturnType<typeof buildApp>>;

  async function clearDomainData(): Promise<void> {
    await client.$transaction([
      client.auditLog.deleteMany(),
      client.userInvitation.deleteMany(),
      client.passwordResetToken.deleteMany(),
      client.userSession.deleteMany(),
      client.tenantMembership.deleteMany(),
      client.service.deleteMany(),
      client.businessUnit.deleteMany(),
      client.tenantSettings.deleteMany(),
      client.tenantCustomFieldDefinition.deleteMany(),
      client.tenantFeatureOverride.deleteMany(),
      client.tenantTerminology.deleteMany(),
      client.tenantBranding.deleteMany(),
      client.tenant.deleteMany(),
      client.user.deleteMany({ where: { platformAdministration: { none: {} } } }),
    ]);
  }

  beforeAll(async () => {
    const databaseName = await client.$queryRaw<{ databaseName: string }[]>`
      SELECT DATABASE() AS databaseName
    `;
    expect(databaseName[0]?.databaseName).toBe('plataforma_audit');
    await clearDomainData();
    app = await buildApp({ environment, database: connection, messageDelivery: delivery });
  });

  afterAll(async () => {
    await app.close();
    await clearDomainData();
    await client.$disconnect();
  });

  it('valida provisionamento, isolamento, RBAC, tokens e concorrÃªncia no banco real', async () => {
    const run = randomUUID().slice(0, 8);
    const passwordA = secret();
    const passwordB = secret();
    const ownerAEmail = `owner-a-${run}@audit.invalid`;
    const ownerBEmail = `owner-b-${run}@audit.invalid`;

    const provision = async (suffix: string, email: string, password: string) =>
      app.inject({
        method: 'POST',
        url: '/internal/tenants',
        payload: {
          legalName: `Auditoria ${suffix} Ltda.`,
          displayName: `Auditoria ${suffix}`,
          slug: `auditoria-${suffix.toLowerCase()}-${run}`,
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
          initialUnit: { name: 'Matriz', slug: 'matriz', countryCode: 'BR' },
          owner: { email, password },
        },
      });

    const createdA = await provision('A', ownerAEmail, passwordA);
    const createdB = await provision('B', ownerBEmail, passwordB);
    expect(createdA.statusCode, createdA.body).toBe(201);
    expect(createdB.statusCode, createdB.body).toBe(201);
    const tenantA = createdA.json<{ tenant: { publicId: string }; owner: { publicId: string } }>();
    const tenantB = createdB.json<{ tenant: { publicId: string }; owner: { publicId: string } }>();
    expect(createdA.body).not.toContain('password');
    expect(createdA.body).not.toMatch(/"id":/u);

    const storedOwnerA = await client.user.findUniqueOrThrow({
      where: { normalizedEmail: ownerAEmail },
    });
    expect(storedOwnerA.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(storedOwnerA.passwordHash).not.toContain(passwordA);
    expect(await client.tenant.count()).toBe(2);
    expect(await client.tenantSettings.count()).toBe(2);
    expect(await client.businessUnit.count({ where: { isHeadquarters: true } })).toBe(2);
    expect(await client.tenantMembership.count({ where: { isOwner: true } })).toBe(2);

    const duplicate = await provision('A', `other-${run}@audit.invalid`, secret());
    expect(duplicate.statusCode).toBe(409);
    expect(await client.tenant.count()).toBe(2);

    const tenantARecord = await client.tenant.findUniqueOrThrow({
      where: { publicId: tenantA.tenant.publicId },
    });
    await expect(
      client.businessUnit.create({
        data: {
          publicId: randomUUID(),
          tenantId: tenantARecord.id,
          name: 'Segunda matriz',
          slug: 'segunda-matriz',
          status: 'ACTIVE',
          isHeadquarters: true,
          timezone: 'America/Sao_Paulo',
        },
      }),
    ).rejects.toThrow();
    const ownerRole = await client.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
    const professionalRole = await client.role.findUniqueOrThrow({
      where: { code: 'PROFESSIONAL' },
    });
    const spareUser = await client.user.create({
      data: {
        id: 9_007_199_254_740_993n,
        publicId: randomUUID(),
        email: `spare-${run}@audit.invalid`,
        normalizedEmail: `spare-${run}@audit.invalid`,
        passwordHash: storedOwnerA.passwordHash,
        status: 'ACTIVE',
      },
    });
    expect(spareUser.id).toBe(9_007_199_254_740_993n);
    expect(typeof spareUser.id).toBe('bigint');
    await expect(
      client.tenantMembership.create({
        data: {
          publicId: randomUUID(),
          tenantId: tenantARecord.id,
          userId: spareUser.id,
          roleId: ownerRole.id,
          status: 'ACTIVE',
          isOwner: true,
        },
      }),
    ).rejects.toThrow();
    await expect(
      client.tenantMembership.create({
        data: {
          publicId: randomUUID(),
          tenantId: tenantARecord.id,
          userId: storedOwnerA.id,
          roleId: professionalRole.id,
          status: 'ACTIVE',
          isOwner: false,
        },
      }),
    ).rejects.toThrow();
    await expect(
      client.user.create({
        data: {
          publicId: randomUUID(),
          email: ownerAEmail,
          normalizedEmail: ownerAEmail,
          passwordHash: storedOwnerA.passwordHash,
          status: 'ACTIVE',
        },
      }),
    ).rejects.toThrow();
    await client.user.delete({ where: { id: spareUser.id } });

    const login = async (email: string, password: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      });
      expect(response.statusCode, response.body).toBe(200);
      return authCookie(response);
    };
    let cookieA = await login(ownerAEmail.toUpperCase(), passwordA);
    const cookieB = await login(ownerBEmail, passwordB);
    const sessionA = await client.userSession.findFirstOrThrow({
      where: { userId: storedOwnerA.id, revokedAt: null },
    });
    expect(sessionA.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(cookieA).not.toContain(sessionA.tokenHash);
    expect(typeof storedOwnerA.id).toBe('bigint');

    const allowedA = await app.inject({
      method: 'GET',
      url: '/tenant/units',
      headers: { cookie: cookieA, 'x-tenant-id': tenantA.tenant.publicId },
    });
    expect(TenantUnitsResponseSchema.parse(allowedA.json()).units).toHaveLength(1);
    const crossed = await app.inject({
      method: 'GET',
      url: '/tenant/units',
      headers: { cookie: cookieA, 'x-tenant-id': tenantB.tenant.publicId },
    });
    expect(ErrorResponseSchema.parse(crossed.json()).error.code).toBe('TENANT_ACCESS_DENIED');

    const inviteExisting = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers: { cookie: cookieA, 'x-tenant-id': tenantA.tenant.publicId },
      payload: { email: ownerBEmail, roleCode: 'PROFESSIONAL' },
    });
    expect(inviteExisting.statusCode, inviteExisting.body).toBe(201);
    const existingMessage = delivery.messages.find(
      ({ recipient, kind }) => recipient === ownerBEmail && kind === 'INVITATION',
    );
    if (existingMessage === undefined) throw new Error('Convite controlado nÃ£o capturado.');
    const existingToken = new URL(existingMessage.actionUrl).searchParams.get('token');
    if (existingToken === null) throw new Error('Token controlado ausente.');
    const wrongIdentity = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      headers: { cookie: cookieA },
      payload: { token: existingToken, currentPassword: passwordB },
    });
    expect(wrongIdentity.statusCode).toBe(400);
    const acceptedExisting = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      headers: { cookie: cookieB },
      payload: { token: existingToken },
    });
    expect(acceptedExisting.statusCode, acceptedExisting.body).toBe(200);

    const professionalAllowed = await app.inject({
      method: 'GET',
      url: '/tenant/units',
      headers: { cookie: cookieB, 'x-tenant-id': tenantA.tenant.publicId },
    });
    const professionalDenied = await app.inject({
      method: 'GET',
      url: '/tenant/members',
      headers: { cookie: cookieB, 'x-tenant-id': tenantA.tenant.publicId },
    });
    const ownerBAllowed = await app.inject({
      method: 'GET',
      url: '/tenant/members',
      headers: { cookie: cookieB, 'x-tenant-id': tenantB.tenant.publicId },
    });
    expect(professionalAllowed.statusCode).toBe(200);
    expect(professionalDenied.statusCode).toBe(403);
    expect(ownerBAllowed.statusCode).toBe(200);

    const concurrentEmail = `concurrent-${run}@audit.invalid`;
    const concurrentInvites = await Promise.all(
      [0, 1].map(async () =>
        app.inject({
          method: 'POST',
          url: '/tenant/members/invitations',
          headers: { cookie: cookieA, 'x-tenant-id': tenantA.tenant.publicId },
          payload: { email: concurrentEmail, roleCode: 'RECEPTIONIST' },
        }),
      ),
    );
    expect(concurrentInvites.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);

    const concurrentMessage = delivery.messages.find(
      ({ recipient, kind }) => recipient === concurrentEmail && kind === 'INVITATION',
    );
    if (concurrentMessage === undefined) throw new Error('Convite concorrente nÃ£o capturado.');
    const concurrentToken = new URL(concurrentMessage.actionUrl).searchParams.get('token');
    if (concurrentToken === null) throw new Error('Token concorrente ausente.');
    const receptionistPassword = secret();
    const acceptResults = await Promise.all(
      [0, 1].map(async () =>
        app.inject({
          method: 'POST',
          url: '/auth/invitations/accept',
          payload: { token: concurrentToken, password: receptionistPassword },
        }),
      ),
    );
    expect(acceptResults.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400]);
    const receptionistCookie = await login(concurrentEmail, receptionistPassword);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/tenant/members',
          headers: { cookie: receptionistCookie, 'x-tenant-id': tenantA.tenant.publicId },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/tenant/members/invitations',
          headers: { cookie: receptionistCookie, 'x-tenant-id': tenantA.tenant.publicId },
          payload: { email: `denied-${run}@audit.invalid`, roleCode: 'PROFESSIONAL' },
        })
      ).statusCode,
    ).toBe(403);

    const managerEmail = `manager-${run}@audit.invalid`;
    const managerPassword = secret();
    const managerInvite = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers: { cookie: cookieA, 'x-tenant-id': tenantA.tenant.publicId },
      payload: { email: managerEmail, roleCode: 'MANAGER' },
    });
    expect(managerInvite.statusCode).toBe(201);
    const managerMessage = delivery.messages.find(
      ({ recipient, kind }) => recipient === managerEmail && kind === 'INVITATION',
    );
    if (managerMessage === undefined) throw new Error('Convite de gerente nÃ£o capturado.');
    const managerToken = new URL(managerMessage.actionUrl).searchParams.get('token');
    if (managerToken === null) throw new Error('Token de gerente ausente.');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/invitations/accept',
          payload: { token: managerToken, password: managerPassword },
        })
      ).statusCode,
    ).toBe(200);
    const managerCookie = await login(managerEmail, managerPassword);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/tenant/members',
          headers: { cookie: managerCookie, 'x-tenant-id': tenantA.tenant.publicId },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/tenant/members/invitations',
          headers: { cookie: managerCookie, 'x-tenant-id': tenantA.tenant.publicId },
          payload: { email: `owner-denied-${run}@audit.invalid`, roleCode: 'OWNER' },
        })
      ).statusCode,
    ).toBe(400);

    const receptionistMembership = await client.tenantMembership.findFirstOrThrow({
      where: { tenantId: tenantARecord.id, user: { normalizedEmail: concurrentEmail } },
    });
    const changedMember = await app.inject({
      method: 'PATCH',
      url: `/tenant/members/${receptionistMembership.publicId}`,
      headers: { cookie: managerCookie, 'x-tenant-id': tenantA.tenant.publicId },
      payload: { roleCode: 'PROFESSIONAL', status: 'SUSPENDED' },
    });
    expect(changedMember.statusCode, changedMember.body).toBe(200);
    const membershipAudit = new Set(
      (
        await client.auditLog.findMany({
          where: { targetPublicId: receptionistMembership.publicId },
          select: { action: true },
        })
      ).map(({ action }) => action),
    );
    expect(membershipAudit.has('membership.role_changed')).toBe(true);
    expect(membershipAudit.has('membership.suspended')).toBe(true);

    const forgot = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email: ownerAEmail },
    });
    const forgotMissing = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email: `missing-${run}@audit.invalid` },
    });
    expect(forgot.body).toBe(forgotMissing.body);
    const resetMessage = delivery.messages.findLast(
      ({ recipient, kind }) => recipient === ownerAEmail && kind === 'PASSWORD_RESET',
    );
    if (resetMessage === undefined) throw new Error('RedefiniÃ§Ã£o controlada nÃ£o capturada.');
    const resetToken = new URL(resetMessage.actionUrl).searchParams.get('token');
    if (resetToken === null) throw new Error('Token de redefiniÃ§Ã£o ausente.');
    const newPasswordA = secret();
    const resets = await Promise.all(
      [0, 1].map(async () =>
        app.inject({
          method: 'POST',
          url: '/auth/password/reset',
          payload: { token: resetToken, newPassword: newPasswordA },
        }),
      ),
    );
    expect(resets.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400]);
    expect(
      (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieA } }))
        .statusCode,
    ).toBe(401);
    cookieA = await login(ownerAEmail, newPasswordA);
    const simultaneousLogins = await Promise.all(
      [0, 1, 2, 3].map(async () =>
        app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: ownerAEmail, password: newPasswordA },
        }),
      ),
    );
    expect(simultaneousLogins.map(({ statusCode }) => statusCode)).toEqual([200, 200, 200, 200]);
    expect(
      await client.userSession.count({
        where: { userId: storedOwnerA.id, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ).toBe(3);
    const latestLogin = simultaneousLogins.at(-1);
    if (latestLogin === undefined) throw new Error('Login concorrente ausente.');
    expect(latestLogin.statusCode).toBe(200);
    cookieA = await login(ownerAEmail, newPasswordA);

    await client.tenantMembership.updateMany({
      where: { tenantId: tenantARecord.id, user: { normalizedEmail: ownerBEmail } },
      data: { status: 'SUSPENDED' },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/tenant/units',
          headers: { cookie: cookieB, 'x-tenant-id': tenantA.tenant.publicId },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/tenant/units',
          headers: { cookie: cookieB, 'x-tenant-id': tenantB.tenant.publicId },
        })
      ).statusCode,
    ).toBe(200);

    await expect(client.tenant.delete({ where: { id: tenantARecord.id } })).rejects.toThrow();
    const auditActions = new Set(
      (await client.auditLog.findMany({ select: { action: true } })).map(({ action }) => action),
    );
    for (const action of [
      'membership.owner.created',
      'auth.login.success',
      'auth.invitation.created',
      'auth.invitation.accepted',
      'auth.password_reset.requested',
      'auth.password_reset.completed',
    ])
      expect(auditActions.has(action)).toBe(true);
    const serializedMetadata = JSON.stringify(
      await client.auditLog.findMany({ select: { metadata: true } }),
    );
    expect(serializedMetadata).not.toContain(resetToken);
    expect(serializedMetadata).not.toContain(existingToken);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: cookieA },
      payload: {},
    });
    expect(SuccessResponseSchema.parse(logout.json()).success).toBe(true);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
  }, 120_000);
});
