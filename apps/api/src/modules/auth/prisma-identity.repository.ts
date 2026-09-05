import {
  BusinessUnitSchema,
  CreateTenantWithOwnerResponseSchema,
  InvitationPublicSchema,
  MembershipPublicSchema,
  SessionPublicSchema,
  TenantPublicSchema,
  TenantSettingsSchema,
  UserPublicSchema,
  type AvailableTenant,
  type CreateTenantWithOwnerResponse,
  type InvitationPublic,
  type MembershipPublic,
  type SessionPublic,
  type UpdateMembershipRequest,
  type UserStatus,
} from '@plataforma/shared';

import {
  type AcceptInvitationInput,
  type AuditInput,
  type AuthorizedTenantContext,
  type AuthSessionRecord,
  type AuthUserRecord,
  type CreateInvitationInput,
  type CreateLoginSessionInput,
  type CreateTenantOwnerInput,
  type IdentityRepository,
  IdentityConflictError,
  type InvitationRecord,
  type MembershipListInput,
  type MembershipListResult,
  type PasswordResetInput,
  type RequestMetadata,
} from './identity.repository.js';
import { generatePublicId } from './token.service.js';
import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

const userSelect = {
  id: true,
  publicId: true,
  email: true,
  normalizedEmail: true,
  passwordHash: true,
  status: true,
} as const;

function mapUser(user: {
  id: bigint;
  publicId: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string | null;
  status: UserStatus;
}): AuthUserRecord {
  return { ...user, ...UserPublicSchema.parse(user) };
}

function mapSession(session: {
  id: bigint;
  publicId: string;
  userId: bigint;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  user: Parameters<typeof mapUser>[0];
}): AuthSessionRecord {
  return { ...session, user: mapUser(session.user) };
}

function maskIpAddress(value: string | null): string | null {
  if (value === null) return null;
  if (value.includes(':')) return `${value.split(':').slice(0, 3).join(':')}::`;
  const parts = value.split('.');
  return parts.length === 4 ? `${parts[0] ?? ''}.${parts[1] ?? ''}.x.x` : null;
}

function timeFormat(value: 'H24' | 'H12'): '24H' | '12H' {
  return value === 'H24' ? '24H' : '12H';
}

function prismaTimeFormat(value: '24H' | '12H'): 'H24' | 'H12' {
  return value === '24H' ? 'H24' : 'H12';
}

function conflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();
    if (target.includes('normalized_email')) throw new IdentityConflictError('EMAIL');
    if (target.includes('tenant') && target.includes('slug')) {
      throw new IdentityConflictError('TENANT_SLUG');
    }
    if (target.includes('invitation')) throw new IdentityConflictError('INVITATION');
    if (target.includes('membership')) throw new IdentityConflictError('MEMBERSHIP');
    throw new IdentityConflictError('STRUCTURE');
  }
  throw error;
}

function auditData(input: AuditInput): Prisma.AuditLogUncheckedCreateInput {
  return {
    publicId: generatePublicId(),
    action: input.action,
    targetType: input.targetType,
    ...(input.targetPublicId === undefined ? {} : { targetPublicId: input.targetPublicId }),
    ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  };
}

export class PrismaIdentityRepository implements IdentityRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async createTenantWithOwner(
    input: CreateTenantOwnerInput,
  ): Promise<CreateTenantWithOwnerResponse> {
    try {
      return await this.client.$transaction(
        async (transaction) => {
          const ownerRole = await transaction.role.findFirst({
            where: { code: 'OWNER', isSystem: true, tenantId: null },
            select: { id: true },
          });
          if (ownerRole === null) throw new Error('O papel estrutural OWNER não foi inicializado.');

          const tenant = await transaction.tenant.create({
            data: {
              publicId: input.tenantPublicId,
              slug: input.request.slug,
              legalName: input.request.legalName,
              displayName: input.request.displayName,
              status: 'ACTIVE',
              timezone: input.request.timezone,
              locale: input.request.locale,
              currency: input.request.currency,
            },
          });
          const settings = await transaction.tenantSettings.create({
            data: {
              tenantId: tenant.id,
              allowMultipleUnits: input.request.settings.allowMultipleUnits,
              defaultAppointmentIntervalMinutes:
                input.request.settings.defaultAppointmentIntervalMinutes,
              weekStartsOn: input.request.settings.weekStartsOn,
              dateFormat: input.request.settings.dateFormat,
              timeFormat: prismaTimeFormat(input.request.settings.timeFormat),
            },
          });
          const unit = await transaction.businessUnit.create({
            data: {
              publicId: input.unitPublicId,
              tenantId: tenant.id,
              name: input.request.initialUnit.name,
              slug: input.request.initialUnit.slug,
              status: 'ACTIVE',
              isHeadquarters: true,
              timezone: input.request.timezone,
              postalCode: input.request.initialUnit.postalCode ?? null,
              street: input.request.initialUnit.street ?? null,
              number: input.request.initialUnit.number ?? null,
              complement: input.request.initialUnit.complement ?? null,
              district: input.request.initialUnit.district ?? null,
              city: input.request.initialUnit.city ?? null,
              state: input.request.initialUnit.state ?? null,
              countryCode: input.request.initialUnit.countryCode ?? null,
              latitude: input.request.initialUnit.latitude ?? null,
              longitude: input.request.initialUnit.longitude ?? null,
              googleMapsUrl: input.request.initialUnit.googleMapsUrl ?? null,
            },
          });
          const now = new Date();
          const user = await transaction.user.create({
            data: {
              publicId: input.userPublicId,
              email: input.request.owner.email,
              normalizedEmail: input.request.owner.email.trim().toLowerCase(),
              passwordHash: input.passwordHash,
              status: 'ACTIVE',
              passwordChangedAt: now,
            },
          });
          await transaction.tenantMembership.create({
            data: {
              publicId: input.membershipPublicId,
              tenantId: tenant.id,
              userId: user.id,
              roleId: ownerRole.id,
              status: 'ACTIVE',
              isOwner: true,
              joinedAt: now,
            },
          });
          await transaction.auditLog.create({
            data: auditData({
              action: 'membership.owner.created',
              targetType: 'tenant_membership',
              targetPublicId: input.membershipPublicId,
              tenantId: tenant.id,
              userId: user.id,
              ipAddress: null,
              userAgent: null,
            }),
          });

          return CreateTenantWithOwnerResponseSchema.parse({
            tenant: TenantPublicSchema.parse(tenant),
            settings: TenantSettingsSchema.parse({
              ...settings,
              timeFormat: timeFormat(settings.timeFormat),
            }),
            initialUnit: BusinessUnitSchema.parse(unit),
            owner: UserPublicSchema.parse(user),
            membershipPublicId: input.membershipPublicId,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      return conflict(error);
    }
  }

  public async findUserByNormalizedEmail(normalizedEmail: string): Promise<AuthUserRecord | null> {
    const user = await this.client.user.findUnique({
      where: { normalizedEmail },
      select: userSelect,
    });
    return user === null ? null : mapUser(user);
  }

  public async findUserByGoogleSub(googleSub: string): Promise<AuthUserRecord | null> {
    const user = await this.client.user.findUnique({
      where: { googleSub },
      select: userSelect,
    });
    return user === null ? null : mapUser(user);
  }

  public async linkGoogleSub(userId: bigint, googleSub: string): Promise<void> {
    try {
      await this.client.user.update({
        where: { id: userId },
        data: { googleSub },
      });
    } catch (error) {
      return conflict(error);
    }
  }

  public async createGoogleUser(input: {
    publicId: string;
    email: string;
    normalizedEmail: string;
    googleSub: string;
    name: string;
  }): Promise<AuthUserRecord> {
    try {
      const user = await this.client.user.create({
        data: {
          publicId: input.publicId,
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          googleSub: input.googleSub,
          status: 'ACTIVE',
        },
        select: userSelect,
      });
      return mapUser(user);
    } catch (error) {
      return conflict(error);
    }
  }

  public async createLoginSession(input: CreateLoginSessionInput): Promise<AuthSessionRecord> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const active = await transaction.userSession.findMany({
              where: { userId: input.userId, revokedAt: null, expiresAt: { gt: input.now } },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            });
            const excess = active.length - input.maxActiveSessions + 1;
            if (excess > 0) {
              await transaction.userSession.updateMany({
                where: { id: { in: active.slice(0, excess).map(({ id }) => id) }, revokedAt: null },
                data: { revokedAt: input.now, revocationReason: 'SESSION_LIMIT' },
              });
            }
            const session = await transaction.userSession.create({
              data: {
                publicId: input.publicId,
                userId: input.userId,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
                lastSeenAt: input.now,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
              },
              include: { user: { select: userSelect } },
            });
            await transaction.user.update({
              where: { id: input.userId },
              data: { lastLoginAt: input.now },
            });
            await transaction.auditLog.create({
              data: auditData({
                action: 'auth.login.success',
                targetType: 'user_session',
                targetPublicId: session.publicId,
                userId: input.userId,
                sessionId: session.id,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
              }),
            });
            return mapSession(session);
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 5
        ) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, attempt * 10);
          });
          continue;
        }
        throw error;
      }
    }
    throw new Error('O limite de repetiÃ§Ãµes da criaÃ§Ã£o de sessÃ£o foi excedido.');
  }

  public async updatePasswordHash(userId: bigint, passwordHash: string): Promise<void> {
    await this.client.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  public async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    const session = await this.client.userSession.findUnique({
      where: { tokenHash },
      include: { user: { select: userSelect } },
    });
    return session === null ? null : mapSession(session);
  }

  public async touchSession(sessionId: bigint, now: Date): Promise<void> {
    await this.client.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastSeenAt: now },
    });
  }

  public async listAvailableTenants(userId: bigint): Promise<AvailableTenant[]> {
    const memberships = await this.client.tenantMembership.findMany({
      where: { userId, status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      orderBy: { tenant: { displayName: 'asc' } },
      include: { tenant: true, role: { select: { code: true } } },
    });
    return memberships.map((membership) => ({
      tenant: TenantPublicSchema.parse(membership.tenant),
      membership: { publicId: membership.publicId, roleCode: membership.role.code },
    }));
  }

  public async findAuthorizedTenant(
    userId: bigint,
    tenantPublicId: string,
  ): Promise<AuthorizedTenantContext | null> {
    const membership = await this.client.tenantMembership.findFirst({
      where: { userId, tenant: { publicId: tenantPublicId } },
      include: {
        tenant: true,
        role: { include: { permissions: { include: { permission: true } } } },
        units: { include: { unit: { select: { publicId: true } } } },
      },
    });
    if (membership === null) return null;
    return {
      id: membership.tenant.id,
      ...TenantPublicSchema.parse(membership.tenant),
      membership: {
        id: membership.id,
        publicId: membership.publicId,
        status: membership.status,
        roleCode: membership.role.code,
        permissions: membership.role.permissions.map(({ permission }) => permission.code),
        isOwner: membership.isOwner,
        unitPublicIds: membership.allUnits
          ? null
          : membership.units.map(({ unit }) => unit.publicId),
      },
    };
  }

  public async listSessions(userId: bigint, currentSessionId: bigint): Promise<SessionPublic[]> {
    const sessions = await this.client.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) =>
      SessionPublicSchema.parse({
        publicId: session.publicId,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        userAgent: session.userAgent,
        ipAddress: maskIpAddress(session.ipAddress),
        current: session.id === currentSessionId,
      }),
    );
  }

  public async revokeSession(
    userId: bigint,
    sessionPublicId: string,
    now: Date,
  ): Promise<{ current: boolean } | null> {
    const session = await this.client.userSession.findFirst({
      where: { userId, publicId: sessionPublicId, revokedAt: null },
      select: { id: true },
    });
    if (session === null) return null;
    await this.client.userSession.update({
      where: { id: session.id },
      data: { revokedAt: now, revocationReason: 'USER_REVOKED' },
    });
    return { current: false };
  }

  public async revokeAllSessions(userId: bigint, now: Date): Promise<void> {
    await this.client.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revocationReason: 'LOGOUT_ALL' },
    });
  }

  public async createPasswordReset(input: PasswordResetInput): Promise<{ email: string } | null> {
    const user = await this.client.user.findUnique({
      where: { normalizedEmail: input.normalizedEmail },
    });
    if (user?.status !== 'ACTIVE') return null;
    await this.client.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: input.now },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          requestedIp: input.ipAddress,
        },
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'auth.password_reset.requested',
          targetType: 'user',
          targetPublicId: user.publicId,
          userId: user.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        }),
      });
    });
    return { email: user.email };
  }

  public async resetPassword(
    tokenHash: string,
    passwordHash: string,
    now: Date,
    metadata: RequestMetadata,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const token = await transaction.passwordResetToken.findUnique({
              where: { tokenHash },
              include: { user: true },
            });
            if (token?.usedAt !== null || token.expiresAt <= now) return false;
            const claimed = await transaction.passwordResetToken.updateMany({
              where: { id: token.id, usedAt: null },
              data: { usedAt: now },
            });
            if (claimed.count !== 1) return false;
            await transaction.user.update({
              where: { id: token.userId },
              data: { passwordHash, passwordChangedAt: now, status: 'ACTIVE' },
            });
            await transaction.passwordResetToken.updateMany({
              where: { userId: token.userId, usedAt: null },
              data: { usedAt: now },
            });
            await transaction.userSession.updateMany({
              where: { userId: token.userId, revokedAt: null },
              data: { revokedAt: now, revocationReason: 'PASSWORD_CHANGED' },
            });
            await transaction.auditLog.create({
              data: auditData({
                action: 'auth.password_reset.completed',
                targetType: 'user',
                targetPublicId: token.user.publicId,
                userId: token.userId,
                ipAddress: metadata.ipAddress,
                userAgent: metadata.userAgent,
              }),
            });
            return true;
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('O limite de repetiÃ§Ãµes da redefiniÃ§Ã£o foi excedido.');
  }

  public async createInvitation(input: CreateInvitationInput): Promise<InvitationRecord> {
    try {
      return await this.client.$transaction(
        async (transaction) => {
          // Serializa convites por tenant antes de revalidar o e-mail pendente.
          await transaction.$queryRaw`
            SELECT id FROM tenants WHERE id = ${input.tenantId} FOR UPDATE
          `;
          const role = await transaction.role.findFirst({
            where: { code: input.request.roleCode, isSystem: true, tenantId: null },
          });
          if (role === null) throw new IdentityConflictError('STRUCTURE');
          const pending = await transaction.userInvitation.findFirst({
            where: {
              tenantId: input.tenantId,
              normalizedEmail: input.normalizedEmail,
              status: 'PENDING',
            },
            select: { id: true },
          });
          if (pending !== null) throw new IdentityConflictError('INVITATION');
          const existingUser = await transaction.user.findUnique({
            where: { normalizedEmail: input.normalizedEmail },
            select: { id: true },
          });
          if (
            existingUser !== null &&
            (await transaction.tenantMembership.findUnique({
              where: { tenantId_userId: { tenantId: input.tenantId, userId: existingUser.id } },
            })) !== null
          ) {
            throw new IdentityConflictError('MEMBERSHIP');
          }
          const invitation = await transaction.userInvitation.create({
            data: {
              publicId: input.publicId,
              tenantId: input.tenantId,
              email: input.request.email,
              normalizedEmail: input.normalizedEmail,
              roleId: role.id,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
              invitedByUserId: input.invitedByUserId,
            },
          });
          await transaction.auditLog.create({
            data: auditData({
              action: 'auth.invitation.created',
              targetType: 'user_invitation',
              targetPublicId: invitation.publicId,
              tenantId: input.tenantId,
              userId: input.invitedByUserId,
              sessionId: input.invitedBySessionId,
              metadata: { roleCode: input.request.roleCode },
              ipAddress: input.ipAddress,
              userAgent: input.userAgent,
            }),
          });
          return {
            id: invitation.id,
            publicId: invitation.publicId,
            tenantId: invitation.tenantId,
            email: invitation.email,
            normalizedEmail: invitation.normalizedEmail,
            roleCode: role.code,
            expiresAt: invitation.expiresAt,
            status: invitation.status,
            existingUser: null,
          };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      return conflict(error);
    }
  }

  public async findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const invitation = await this.client.userInvitation.findUnique({
      where: { tokenHash },
      include: {
        role: { select: { code: true } },
      },
    });
    if (invitation === null) return null;
    const user = await this.findUserByNormalizedEmail(invitation.normalizedEmail);
    return {
      id: invitation.id,
      publicId: invitation.publicId,
      tenantId: invitation.tenantId,
      email: invitation.email,
      normalizedEmail: invitation.normalizedEmail,
      roleCode: invitation.role.code,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
      existingUser: user,
    };
  }

  public async listInvitations(tenantId: bigint): Promise<InvitationPublic[]> {
    const invitations = await this.client.userInvitation.findMany({
      where: { tenantId, status: 'PENDING' },
      include: { role: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((invitation) =>
      InvitationPublicSchema.parse({
        publicId: invitation.publicId,
        email: invitation.email,
        roleCode: invitation.role.code,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
      }),
    );
  }

  public async revokeInvitation(
    tenantId: bigint,
    invitationPublicId: string,
    actor: { user: { id: bigint }; session: { id: bigint } },
    metadata: RequestMetadata,
  ): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const invitation = await transaction.userInvitation.findFirst({
        where: { tenantId, publicId: invitationPublicId, status: 'PENDING' },
      });
      if (invitation === null) return false;
      await transaction.userInvitation.update({
        where: { id: invitation.id },
        data: { status: 'REVOKED' },
      });
      await transaction.auditLog.create({
        data: auditData({
          action: 'auth.invitation.revoked',
          targetType: 'user_invitation',
          targetPublicId: invitation.publicId,
          tenantId,
          userId: actor.user.id,
          sessionId: actor.session.id,
          ...metadata,
        }),
      });
      return true;
    });
  }

  public async acceptInvitation(input: AcceptInvitationInput): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.client.$transaction(
          async (transaction) => {
            const invitation = await transaction.userInvitation.findUnique({
              where: { id: input.invitationId },
              include: { role: { select: { code: true } } },
            });
            if (invitation?.status !== 'PENDING' || invitation.expiresAt <= input.now) {
              throw new IdentityConflictError('INVITATION');
            }
            if (invitation.role.code === 'OWNER') {
              // A linha do tenant é o mutex transacional portátil para promoção a OWNER.
              await transaction.$queryRaw`
                SELECT id FROM tenants WHERE id = ${invitation.tenantId} FOR UPDATE
              `;
              const owner = await transaction.tenantMembership.findFirst({
                where: { tenantId: invitation.tenantId, isOwner: true },
                select: { id: true },
              });
              if (owner !== null) throw new IdentityConflictError('MEMBERSHIP');
            }
            let user = await transaction.user.findUnique({
              where: { normalizedEmail: invitation.normalizedEmail },
            });
            if (user === null) {
              if (input.passwordHash === undefined || input.newUserPublicId === undefined) {
                throw new IdentityConflictError('STRUCTURE');
              }
              user = await transaction.user.create({
                data: {
                  publicId: input.newUserPublicId,
                  email: invitation.email,
                  normalizedEmail: invitation.normalizedEmail,
                  passwordHash: input.passwordHash,
                  passwordChangedAt: input.now,
                  status: 'ACTIVE',
                },
              });
            }
            const existingMembership = await transaction.tenantMembership.findUnique({
              where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
              select: { id: true, status: true },
            });
            if (existingMembership !== null && existingMembership.status !== 'INVITED') {
              throw new IdentityConflictError('MEMBERSHIP');
            }
            if (existingMembership === null) {
              await new PlanEntitlementService().assertCanAddMember(
                transaction,
                invitation.tenantId,
              );
              await transaction.tenantMembership.create({
                data: {
                  publicId: input.membershipPublicId,
                  tenantId: invitation.tenantId,
                  userId: user.id,
                  roleId: invitation.roleId,
                  status: 'ACTIVE',
                  isOwner: invitation.role.code === 'OWNER',
                  joinedAt: input.now,
                },
              });
            } else {
              await transaction.tenantMembership.update({
                where: { id: existingMembership.id },
                data: {
                  roleId: invitation.roleId,
                  status: 'ACTIVE',
                  isOwner: invitation.role.code === 'OWNER',
                  joinedAt: input.now,
                },
              });
            }
            await transaction.userInvitation.update({
              where: { id: invitation.id },
              data: { status: 'ACCEPTED', acceptedAt: input.now },
            });
            await transaction.auditLog.create({
              data: auditData({
                action: 'auth.invitation.accepted',
                targetType: 'tenant_membership',
                targetPublicId: input.membershipPublicId,
                tenantId: invitation.tenantId,
                userId: user.id,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
              }),
            });
          },
          { isolationLevel: 'Serializable' },
        );
        return;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        ) {
          continue;
        }
        conflict(error);
      }
    }
  }

  public async listMembers(
    tenantId: bigint,
    input: MembershipListInput,
  ): Promise<MembershipListResult> {
    const where = {
      tenantId,
      ...(input.email === undefined
        ? {}
        : { user: { normalizedEmail: { contains: input.email.trim().toLowerCase() } } }),
      ...(input.roleCode === undefined ? {} : { role: { code: input.roleCode } }),
      ...(input.status === undefined ? {} : { status: input.status }),
    };
    const orderBy =
      input.orderBy === 'email'
        ? { user: { normalizedEmail: input.direction } }
        : input.orderBy === 'roleCode'
          ? { role: { code: input.direction } }
          : input.orderBy === 'status'
            ? { status: input.direction }
            : { createdAt: input.direction };
    const [total, memberships] = await this.client.$transaction([
      this.client.tenantMembership.count({ where }),
      this.client.tenantMembership.findMany({
        where,
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        orderBy: [{ isOwner: 'desc' }, orderBy],
        include: { user: true, role: true, units: { include: { unit: true } } },
      }),
    ]);
    return {
      members: memberships.map((membership) =>
        MembershipPublicSchema.parse({
          publicId: membership.publicId,
          user: UserPublicSchema.parse(membership.user),
          roleCode: membership.role.code,
          status: membership.status,
          isOwner: membership.isOwner,
          joinedAt: membership.joinedAt?.toISOString() ?? null,
          createdAt: membership.createdAt.toISOString(),
          unitPublicIds: membership.allUnits
            ? null
            : membership.units.map(({ unit }) => unit.publicId),
        }),
      ),
      page: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }

  public async updateMembership(
    tenantId: bigint,
    membershipPublicId: string,
    request: UpdateMembershipRequest,
    actor: { user: { id: bigint }; session: { id: bigint } },
    metadata: RequestMetadata,
  ): Promise<MembershipPublic | null> {
    return this.client.$transaction(async (transaction) => {
      const membership = await transaction.tenantMembership.findFirst({
        where: { tenantId, publicId: membershipPublicId },
        include: { user: true, role: true, units: { include: { unit: true } } },
      });
      if (membership === null) return null;
      if (membership.isOwner) throw new IdentityConflictError('MEMBERSHIP');
      const role =
        request.roleCode === undefined
          ? membership.role
          : await transaction.role.findFirst({
              where: { code: request.roleCode, isSystem: true, tenantId: null },
            });
      if (role === null || role.code === 'OWNER') throw new IdentityConflictError('STRUCTURE');
      const scopedUnits =
        request.unitPublicIds === undefined || request.unitPublicIds === null
          ? []
          : await transaction.businessUnit.findMany({
              where: { tenantId, publicId: { in: request.unitPublicIds } },
              select: { id: true, publicId: true },
            });
      if (
        request.unitPublicIds !== undefined &&
        request.unitPublicIds !== null &&
        scopedUnits.length !== new Set(request.unitPublicIds).size
      )
        throw new IdentityConflictError('STRUCTURE');
      const updated = await transaction.tenantMembership.update({
        where: { id: membership.id },
        data: {
          roleId: role.id,
          ...(request.status === undefined ? {} : { status: request.status }),
          ...(request.unitPublicIds === undefined
            ? {}
            : {
                allUnits: request.unitPublicIds === null,
                units: { deleteMany: {}, create: scopedUnits.map((unit) => ({ unitId: unit.id })) },
              }),
        },
        include: { user: true, role: true, units: { include: { unit: true } } },
      });
      const actions: string[] = [];
      if (request.roleCode !== undefined) actions.push('membership.role_changed');
      if (request.status === 'SUSPENDED') actions.push('membership.suspended');
      if (request.status === 'ACTIVE') actions.push('membership.reactivated');
      if (request.status === 'INACTIVE') actions.push('membership.inactivated');
      if (request.unitPublicIds !== undefined) actions.push('membership.unit_scope_changed');
      for (const action of actions) {
        await transaction.auditLog.create({
          data: auditData({
            action,
            targetType: 'tenant_membership',
            targetPublicId: updated.publicId,
            tenantId,
            userId: actor.user.id,
            sessionId: actor.session.id,
            metadata: { roleCode: updated.role.code, status: updated.status },
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          }),
        });
      }
      return MembershipPublicSchema.parse({
        publicId: updated.publicId,
        user: UserPublicSchema.parse(updated.user),
        roleCode: updated.role.code,
        status: updated.status,
        isOwner: updated.isOwner,
        joinedAt: updated.joinedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        unitPublicIds: updated.allUnits ? null : updated.units.map(({ unit }) => unit.publicId),
      });
    });
  }

  public async recordAudit(input: AuditInput): Promise<void> {
    await this.client.auditLog.create({ data: auditData(input) });
  }

  public async setUserStatus(userId: bigint, status: UserStatus): Promise<void> {
    await this.client.user.update({ where: { id: userId }, data: { status } });
  }
}
