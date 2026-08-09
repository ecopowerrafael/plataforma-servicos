import {
  AuthMeResponseSchema,
  AuthSessionsResponseSchema,
  ErrorResponseSchema,
  ForgotPasswordResponseSchema,
  LoginResponseSchema,
  SuccessResponseSchema,
  UserPublicSchema,
} from '@plataforma/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryIdentityRepository } from './helpers/in-memory-identity.repository.js';
import { InMemoryTenantRepository } from './helpers/in-memory-tenant.repository.js';
import { buildApp } from '../src/app.js';
import { type Environment } from '../src/config/environment.js';
import { type DatabaseConnection } from '../src/database/connection.js';
import { CapturingAccountMessageDelivery } from '../src/modules/auth/message-delivery.js';
import { PasswordService } from '../src/modules/auth/password.service.js';

const environment: Environment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  DATABASE_URL: 'mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos',
  CORS_ORIGINS: ['http://localhost:5173'],
  LOG_LEVEL: 'silent',
  APP_WEB_URL: 'http://localhost:5173',
  AUTH_COOKIE_NAME: 'ps_session',
  AUTH_SESSION_TTL_HOURS: 168,
  AUTH_MAX_ACTIVE_SESSIONS: 2,
  AUTH_COOKIE_SECURE: false,
  PASSWORD_ARGON2_MEMORY_COST: 19_456,
  PASSWORD_ARGON2_TIME_COST: 2,
  PASSWORD_ARGON2_PARALLELISM: 1,
  LOGIN_RATE_LIMIT_MAX: 3,
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: 15,
  PASSWORD_RESET_TTL_MINUTES: 30,
  INVITATION_TTL_HOURS: 48,
  SMTP_PORT: 587,
  SMTP_SECURE: false,
};

const userPublicId = '11111111-1111-4111-8111-111111111111';
const tenantPublicId = '22222222-2222-4222-8222-222222222222';
const membershipPublicId = '33333333-3333-4333-8333-333333333333';
const password = 'Senha segura 123';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const fixturePasswordHash = new PasswordService({
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
}).hash(password);

class FailingAccountMessageDelivery extends CapturingAccountMessageDelivery {
  public override deliver(): Promise<void> {
    return Promise.reject(new Error('controlled delivery failure'));
  }
}

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('controlled fixture missing');
  return value;
}

async function fixture(options?: {
  status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'INACTIVE';
  permissions?: string[];
  environment?: Environment;
  failMessageDelivery?: boolean;
}) {
  const identities = new InMemoryIdentityRepository();
  const tenantRepository = new InMemoryTenantRepository();
  const delivery = options?.failMessageDelivery
    ? new FailingAccountMessageDelivery()
    : new CapturingAccountMessageDelivery();
  const passwordHash = await fixturePasswordHash;
  identities.seedUser({
    id: 1n,
    publicId: userPublicId,
    email: 'Pessoa@Empresa.test',
    normalizedEmail: 'pessoa@empresa.test',
    passwordHash,
    status: options?.status ?? 'ACTIVE',
  });
  identities.seedAccess(1n, {
    id: 2n,
    publicId: tenantPublicId,
    slug: 'empresa-segura',
    displayName: 'Empresa Segura',
    status: 'ACTIVE',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    currency: 'BRL',
    membership: {
      id: 3n,
      publicId: membershipPublicId,
      status: 'ACTIVE',
      roleCode: 'OWNER',
      permissions: options?.permissions ?? [
        'tenant.read',
        'unit.read',
        'membership.read',
        'membership.invite',
        'membership.update',
        'membership.suspend',
      ],
      isOwner: true,
    },
  });
  const database: DatabaseConnection = {
    identities,
    tenants: tenantRepository,
    ping: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const app = await buildApp({
    environment: options?.environment ?? environment,
    database,
    messageDelivery: delivery,
    logger: false,
  });
  apps.push(app);
  return { app, identities, delivery };
}

afterEach(async () => Promise.all(apps.splice(0).map(async (app) => app.close())));

async function login(app: Awaited<ReturnType<typeof buildApp>>, suppliedPassword = password) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: ' pessoa@empresa.test ', password: suppliedPassword },
  });
}

function cookieFrom(response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>) {
  const header = response.headers['set-cookie'];
  if (typeof header !== 'string') throw new Error('cookie missing');
  return required(header.split(';', 1)[0]);
}

describe('autenticação e sessões persistentes', () => {
  it('faz login, cria sessão por hash e configura cookie seguro para o ambiente', async () => {
    const { app, identities } = await fixture();
    const response = await login(app);
    expect(response.statusCode, response.body).toBe(200);
    const payload = LoginResponseSchema.parse(response.json());
    const setCookie = response.headers['set-cookie'];

    expect(payload.user).toEqual({
      publicId: userPublicId,
      email: 'Pessoa@Empresa.test',
      status: 'ACTIVE',
    });
    expect(payload.tenants).toHaveLength(1);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure');
    expect(identities.sessions[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(setCookie).not.toContain(required(identities.sessions[0]).tokenHash);
    expect(identities.audits.some(({ action }) => action === 'auth.login.success')).toBe(true);
  });

  it.each([
    { email: 'inexistente@empresa.test', password },
    { email: 'pessoa@empresa.test', password: 'Senha incorreta 456' },
  ])('não enumera credenciais inválidas', async (payload) => {
    const { app } = await fixture();
    const response = await app.inject({ method: 'POST', url: '/auth/login', payload });
    const error = ErrorResponseSchema.parse(response.json());
    expect(response.statusCode).toBe(401);
    expect(error.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(error.error.message).toBe('E-mail ou senha inválidos.');
  });

  it.each(['INVITED', 'SUSPENDED', 'INACTIVE'] as const)(
    'bloqueia usuário %s sem enumerá-lo',
    async (status) => {
      const { app } = await fixture({ status });
      const response = await login(app);
      expect(ErrorResponseSchema.parse(response.json()).error.code).toBe(
        'AUTH_INVALID_CREDENTIALS',
      );
    },
  );

  it('consulta sessão atual, lista sessões próprias e encerra somente a atual', async () => {
    const { app, identities } = await fixture();
    const authCookie = cookieFrom(await login(app));
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: authCookie },
    });
    const sessions = await app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { cookie: authCookie },
    });
    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: authCookie },
      payload: {},
    });

    expect(AuthMeResponseSchema.parse(me.json()).currentTenant).toBeNull();
    expect(AuthSessionsResponseSchema.parse(sessions.json()).sessions[0]?.current).toBe(true);
    expect(SuccessResponseSchema.parse(logout.json()).success).toBe(true);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    expect(identities.sessions[0]?.revokedAt).not.toBeNull();
  });

  it('não permite consultar ou revogar sessão de outro usuário', async () => {
    const { app } = await fixture();
    const authCookie = cookieFrom(await login(app));
    const response = await app.inject({
      method: 'DELETE',
      url: '/auth/sessions/99999999-9999-4999-8999-999999999999',
      headers: { cookie: authCookie },
    });
    expect(response.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('SESSION_NOT_FOUND');
  });

  it('aplica limite de sessões e logout global', async () => {
    const { app, identities } = await fixture();
    await login(app);
    await login(app);
    const latestCookie = cookieFrom(await login(app));
    expect(identities.sessions.filter(({ revokedAt }) => revokedAt === null)).toHaveLength(2);
    await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { cookie: latestCookie },
      payload: {},
    });
    expect(identities.sessions.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
  });

  it('invalida sessão expirada, revogada e usuário suspenso após o login', async () => {
    const { app, identities } = await fixture();
    const authCookie = cookieFrom(await login(app));
    required(identities.sessions[0]).expiresAt = new Date(Date.now() - 1);
    let response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: authCookie },
    });
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('SESSION_EXPIRED');
    required(identities.sessions[0]).expiresAt = new Date(Date.now() + 60_000);
    required(identities.sessions[0]).revokedAt = new Date();
    response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: authCookie },
    });
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('SESSION_INVALID');
    required(identities.sessions[0]).revokedAt = null;
    required(identities.users[0]).status = 'SUSPENDED';
    response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: authCookie },
    });
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('USER_INACTIVE');
  });

  it('limita tentativas de login por IP', async () => {
    const { app } = await fixture();
    for (let index = 0; index < 3; index += 1) await login(app, 'Senha incorreta 456');
    const limited = await login(app, 'Senha incorreta 456');
    expect(limited.statusCode).toBe(429);
    expect(ErrorResponseSchema.parse(limited.json()).error.code).toBe('RATE_LIMITED');
  });

  it('valida CORS, origem de operação autenticada e cookie Secure em produção', async () => {
    const productionEnvironment: Environment = {
      ...environment,
      NODE_ENV: 'production',
      CORS_ORIGINS: ['https://app.empresa.test'],
      APP_WEB_URL: 'https://app.empresa.test',
      AUTH_COOKIE_SECURE: true,
    };
    const { app } = await fixture({ environment: productionEnvironment });
    const loggedIn = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'https://app.empresa.test' },
      payload: { email: 'pessoa@empresa.test', password },
    });
    expect(loggedIn.headers['set-cookie']).toContain('Secure');
    const authCookie = cookieFrom(loggedIn);
    const invalidOrigin = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: authCookie, referer: 'https://origem-invalida.test/logout' },
      payload: {},
    });
    expect(ErrorResponseSchema.parse(invalidOrigin.json()).error.code).toBe('CSRF_ORIGIN_INVALID');
    const blockedCors = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'https://origem-invalida.test' },
      payload: { email: 'pessoa@empresa.test', password },
    });
    expect(ErrorResponseSchema.parse(blockedCors.json()).error.code).toBe('ORIGIN_NOT_ALLOWED');
    const allowedOrigin = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: authCookie, origin: 'https://app.empresa.test' },
      payload: {},
    });
    expect(allowedOrigin.statusCode).toBe(200);
  });
});

describe('recuperação, convites e autorização', () => {
  it('mantém resposta genérica e redefine senha com token de uso único por hash', async () => {
    const { app, identities, delivery } = await fixture();
    const oldCookie = cookieFrom(await login(app));
    const forgot = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email: 'Pessoa@Empresa.test' },
    });
    expect(ForgotPasswordResponseSchema.parse(forgot.json()).message).toContain('Se o e-mail');
    expect(identities.resets[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    const token = required(
      new URL(required(delivery.messages[0]).actionUrl).searchParams.get('token'),
    );
    expect(identities.resets[0]?.tokenHash).not.toBe(token);
    const reset = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, newPassword: 'Nova senha segura 456' },
    });
    expect(reset.statusCode).toBe(200);
    expect(identities.sessions[0]?.revokedAt).not.toBeNull();
    const reused = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, newPassword: 'Outra senha segura 789' },
    });
    expect(reused.statusCode).toBe(400);
    const oldSession = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: oldCookie },
    });
    expect(oldSession.statusCode).toBe(401);
  });

  it('cria e aceita convite autorizado sem persistir token bruto', async () => {
    const { app, identities, delivery } = await fixture();
    const authCookie = cookieFrom(await login(app));
    const invited = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers: { cookie: authCookie, 'x-tenant-id': tenantPublicId },
      payload: { email: 'novo@empresa.test', roleCode: 'RECEPTIONIST' },
    });
    expect(invited.statusCode).toBe(201);
    const token = required(
      new URL(required(delivery.messages.at(-1)).actionUrl).searchParams.get('token'),
    );
    expect(identities.invitations[0]?.tokenHash).not.toBe(token);
    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: { token, password: 'Senha do convite 123' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(identities.invitations[0]?.status).toBe('ACCEPTED');
    expect(
      identities.users.some(({ normalizedEmail }) => normalizedEmail === 'novo@empresa.test'),
    ).toBe(true);
  });

  it('revoga o convite quando o envio falha para permitir nova tentativa', async () => {
    const { app, identities } = await fixture({ failMessageDelivery: true });
    const authCookie = cookieFrom(await login(app));
    const response = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers: { cookie: authCookie, 'x-tenant-id': tenantPublicId },
      payload: { email: 'falha@empresa.test', roleCode: 'RECEPTIONIST' },
    });

    expect(response.statusCode).toBe(503);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('MESSAGE_DELIVERY_FAILED');
    expect(identities.invitations[0]?.status).toBe('REVOKED');
  });

  it('aceita convite de usuário existente somente após confirmar a identidade', async () => {
    const { app, identities, delivery } = await fixture();
    identities.seedUser({
      id: 8n,
      publicId: '88888888-8888-4888-8888-888888888888',
      email: 'existente@empresa.test',
      normalizedEmail: 'existente@empresa.test',
      passwordHash: required(identities.users[0]).passwordHash,
      status: 'ACTIVE',
    });
    const authCookie = cookieFrom(await login(app));
    await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers: { cookie: authCookie, 'x-tenant-id': tenantPublicId },
      payload: { email: 'existente@empresa.test', roleCode: 'PROFESSIONAL' },
    });
    const token = required(
      new URL(required(delivery.messages.at(-1)).actionUrl).searchParams.get('token'),
    );
    const rejected = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: { token, currentPassword: 'Senha incorreta 456' },
    });
    expect(rejected.statusCode).toBe(400);
    const differentAuthenticatedUser = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      headers: { cookie: authCookie },
      payload: { token, currentPassword: password },
    });
    expect(differentAuthenticatedUser.statusCode).toBe(400);
    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: { token, currentPassword: password },
    });
    expect(accepted.statusCode).toBe(200);
  });

  it('bloqueia convite duplicado, token expirado e permite revogação autorizada', async () => {
    const { app, identities, delivery } = await fixture();
    const authCookie = cookieFrom(await login(app));
    const headers = { cookie: authCookie, 'x-tenant-id': tenantPublicId };
    const first = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers,
      payload: { email: 'pendente@empresa.test', roleCode: 'MANAGER' },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers,
      payload: { email: 'pendente@empresa.test', roleCode: 'MANAGER' },
    });
    expect(duplicate.statusCode).toBe(409);
    const token = required(
      new URL(required(delivery.messages.at(-1)).actionUrl).searchParams.get('token'),
    );
    required(identities.invitations[0]).expiresAt = new Date(Date.now() - 1);
    const expired = await app.inject({
      method: 'POST',
      url: '/auth/invitations/accept',
      payload: { token, password: 'Senha do convite 123' },
    });
    expect(expired.statusCode).toBe(400);
    required(identities.invitations[0]).expiresAt = new Date(Date.now() + 60_000);
    const publicId = first.json<{ publicId: string }>().publicId;
    const revoked = await app.inject({
      method: 'DELETE',
      url: `/tenant/members/invitations/${publicId}`,
      headers,
    });
    expect(revoked.statusCode).toBe(200);
    expect(identities.invitations[0]?.status).toBe('REVOKED');
  });

  it('lista membros, atualiza vínculo permitido e protege o proprietário', async () => {
    const { app, identities } = await fixture();
    const authCookie = cookieFrom(await login(app));
    const headers = { cookie: authCookie, 'x-tenant-id': tenantPublicId };
    const ownerMembership = {
      publicId: membershipPublicId,
      user: UserPublicSchema.parse(identities.users[0]),
      roleCode: 'OWNER',
      status: 'ACTIVE' as const,
      isOwner: true,
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const memberMembership = {
      ...ownerMembership,
      publicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      roleCode: 'RECEPTIONIST',
      isOwner: false,
    };
    identities.members.set(2n, [ownerMembership, memberMembership]);
    const listed = await app.inject({ method: 'GET', url: '/tenant/members', headers });
    expect(listed.json<{ members: unknown[] }>().members).toHaveLength(2);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/tenant/members/${memberMembership.publicId}`,
      headers,
      payload: { roleCode: 'MANAGER', status: 'SUSPENDED' },
    });
    expect(updated.json<{ roleCode: string; status: string }>()).toMatchObject({
      roleCode: 'MANAGER',
      status: 'SUSPENDED',
    });
    const protectedOwner = await app.inject({
      method: 'PATCH',
      url: `/tenant/members/${ownerMembership.publicId}`,
      headers,
      payload: { status: 'INACTIVE' },
    });
    expect(ErrorResponseSchema.parse(protectedOwner.json()).error.code).toBe('OWNER_PROTECTED');
  });

  it('lista somente convites pendentes do próprio tenant e para de listar após revogação', async () => {
    const { app, identities } = await fixture();
    const authCookie = cookieFrom(await login(app));
    const headers = { cookie: authCookie, 'x-tenant-id': tenantPublicId };
    const created = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers,
      payload: { email: 'pendente-listagem@empresa.test', roleCode: 'RECEPTIONIST' },
    });
    expect(created.statusCode).toBe(201);
    const publicId = created.json<{ publicId: string }>().publicId;

    identities.invitations.push({
      id: 999n,
      publicId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      tenantId: 999n,
      email: 'outro-tenant@empresa.test',
      normalizedEmail: 'outro-tenant@empresa.test',
      roleCode: 'MANAGER',
      tokenHash: 'unused-token-hash',
      expiresAt: new Date(Date.now() + 60_000),
      status: 'PENDING',
      existingUser: null,
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/tenant/members/invitations',
      headers,
    });
    expect(listed.statusCode).toBe(200);
    const invitations = listed.json<{
      invitations: { publicId: string; email: string }[];
    }>().invitations;
    expect(invitations.map((invitation) => invitation.publicId)).toEqual([publicId]);
    expect(invitations.some((invitation) => invitation.email === 'outro-tenant@empresa.test')).toBe(
      false,
    );

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/tenant/members/invitations/${publicId}`,
      headers,
    });
    expect(revoked.statusCode).toBe(200);

    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/tenant/members/invitations',
      headers,
    });
    expect(afterRevoke.json<{ invitations: unknown[] }>().invitations).toHaveLength(0);
  });

  it('nega listagem de convites sem a permissão membership.read', async () => {
    const { app } = await fixture({ permissions: ['tenant.read'] });
    const authCookie = cookieFrom(await login(app));
    const denied = await app.inject({
      method: 'GET',
      url: '/tenant/members/invitations',
      headers: { cookie: authCookie, 'x-tenant-id': tenantPublicId },
    });
    expect(ErrorResponseSchema.parse(denied.json()).error.code).toBe('PERMISSION_DENIED');
  });

  it('nega convite sem permissão e bloqueia papel OWNER no contrato', async () => {
    const { app } = await fixture({ permissions: ['tenant.read'] });
    const authCookie = cookieFrom(await login(app));
    const denied = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers: { cookie: authCookie, 'x-tenant-id': tenantPublicId },
      payload: { email: 'novo@empresa.test', roleCode: 'RECEPTIONIST' },
    });
    expect(ErrorResponseSchema.parse(denied.json()).error.code).toBe('PERMISSION_DENIED');
    const owner = await app.inject({
      method: 'POST',
      url: '/tenant/members/invitations',
      headers: { cookie: authCookie, 'x-tenant-id': tenantPublicId },
      payload: { email: 'novo@empresa.test', roleCode: 'OWNER' },
    });
    expect(owner.statusCode).toBe(400);
  });

  it('exige permissÃ£o de suspensÃ£o para qualquer alteraÃ§Ã£o de estado do vÃ­nculo', async () => {
    const { app, identities } = await fixture({ permissions: ['membership.update'] });
    const authCookie = cookieFrom(await login(app));
    const membership = {
      publicId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      user: UserPublicSchema.parse(identities.users[0]),
      roleCode: 'RECEPTIONIST',
      status: 'SUSPENDED' as const,
      isOwner: false,
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    identities.members.set(2n, [membership]);

    const response = await app.inject({
      method: 'PATCH',
      url: `/tenant/members/${membership.publicId}`,
      headers: { cookie: authCookie, 'x-tenant-id': tenantPublicId },
      payload: { status: 'ACTIVE' },
    });

    expect(response.statusCode).toBe(403);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('PERMISSION_DENIED');
  });
});
