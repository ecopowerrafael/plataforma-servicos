import {
  BusinessUnitSchema,
  TenantPublicSchema,
  TenantSettingsSchema,
  UserPublicSchema,
  normalizeEmail,
  type AvailableTenant,
  type CreateTenantWithOwnerResponse,
  type MembershipPublic,
  type SessionPublic,
  type UpdateMembershipRequest,
  type UserStatus,
} from '@plataforma/shared';

import {
  type AcceptInvitationInput,
  type AuditInput,
  type AuthorizedTenantContext,
  type AuthRequestContext,
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
} from '../../src/modules/auth/identity.repository.js';

interface StoredSession extends AuthSessionRecord {
  tokenHash: string;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

interface StoredReset {
  userId: bigint;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

interface StoredInvitation extends InvitationRecord {
  tokenHash: string;
  roleCode: 'MANAGER' | 'RECEPTIONIST' | 'PROFESSIONAL';
}

export class InMemoryIdentityRepository implements IdentityRepository {
  public readonly audits: AuditInput[] = [];
  public readonly users: AuthUserRecord[] = [];
  public readonly sessions: StoredSession[] = [];
  public readonly resets: StoredReset[] = [];
  public readonly invitations: StoredInvitation[] = [];
  public readonly accesses: { userId: bigint; tenant: AuthorizedTenantContext }[] = [];
  public readonly members = new Map<bigint, MembershipPublic[]>();
  private nextId = 100n;

  public seedUser(user: AuthUserRecord): void {
    this.users.push(user);
  }

  public seedAccess(userId: bigint, tenant: AuthorizedTenantContext): void {
    this.accesses.push({ userId, tenant });
  }

  public seedSession(session: StoredSession): void {
    this.sessions.push(session);
  }

  public createTenantWithOwner(
    input: CreateTenantOwnerInput,
  ): Promise<CreateTenantWithOwnerResponse> {
    if (
      this.users.some(
        ({ normalizedEmail }) => normalizedEmail === normalizeEmail(input.request.owner.email),
      )
    ) {
      throw new IdentityConflictError('EMAIL');
    }
    const owner = UserPublicSchema.parse({
      publicId: input.userPublicId,
      email: input.request.owner.email,
      status: 'ACTIVE',
    });
    return Promise.resolve({
      tenant: TenantPublicSchema.parse({
        publicId: input.tenantPublicId,
        slug: input.request.slug,
        displayName: input.request.displayName,
        status: 'ACTIVE',
        timezone: input.request.timezone,
        locale: input.request.locale,
        currency: input.request.currency,
      }),
      settings: TenantSettingsSchema.parse(input.request.settings),
      initialUnit: BusinessUnitSchema.parse({
        publicId: input.unitPublicId,
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
      }),
      owner,
      membershipPublicId: input.membershipPublicId,
    });
  }

  public findUserByNormalizedEmail(normalizedEmail: string): Promise<AuthUserRecord | null> {
    return Promise.resolve(
      this.users.find((user) => user.normalizedEmail === normalizedEmail) ?? null,
    );
  }

  public createLoginSession(input: CreateLoginSessionInput): Promise<AuthSessionRecord> {
    const user = this.users.find(({ id }) => id === input.userId);
    if (user === undefined) throw new Error('controlled user missing');
    const active = this.sessions
      .filter(
        (session) =>
          session.userId === input.userId &&
          session.revokedAt === null &&
          session.expiresAt > input.now,
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const excess = active.length - input.maxActiveSessions + 1;
    active.slice(0, Math.max(0, excess)).forEach((session) => {
      session.revokedAt = input.now;
    });
    const session: StoredSession = {
      id: this.nextId++,
      publicId: input.publicId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      lastSeenAt: input.now,
      revokedAt: null,
      user,
      createdAt: input.now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };
    this.sessions.push(session);
    this.audits.push({
      action: 'auth.login.success',
      targetType: 'user_session',
      userId: user.id,
      sessionId: session.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    return Promise.resolve(session);
  }

  public updatePasswordHash(userId: bigint, passwordHash: string): Promise<void> {
    const user = this.users.find(({ id }) => id === userId);
    if (user !== undefined) user.passwordHash = passwordHash;
    return Promise.resolve();
  }

  public findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    return Promise.resolve(
      this.sessions.find((session) => session.tokenHash === tokenHash) ?? null,
    );
  }

  public touchSession(sessionId: bigint, now: Date): Promise<void> {
    const session = this.sessions.find(({ id }) => id === sessionId);
    if (session !== undefined) session.lastSeenAt = now;
    return Promise.resolve();
  }

  public listAvailableTenants(userId: bigint): Promise<AvailableTenant[]> {
    return Promise.resolve(
      this.accesses
        .filter(
          (access) =>
            access.userId === userId &&
            access.tenant.status === 'ACTIVE' &&
            access.tenant.membership.status === 'ACTIVE',
        )
        .map(({ tenant }) => ({
          tenant: TenantPublicSchema.parse(tenant),
          membership: {
            publicId: tenant.membership.publicId,
            roleCode: tenant.membership.roleCode,
          },
        })),
    );
  }

  public findAuthorizedTenant(
    userId: bigint,
    tenantPublicId: string,
  ): Promise<AuthorizedTenantContext | null> {
    return Promise.resolve(
      this.accesses.find(
        (access) => access.userId === userId && access.tenant.publicId === tenantPublicId,
      )?.tenant ?? null,
    );
  }

  public listSessions(userId: bigint, currentSessionId: bigint): Promise<SessionPublic[]> {
    return Promise.resolve(
      this.sessions
        .filter((session) => session.userId === userId && session.revokedAt === null)
        .map((session) => ({
          publicId: session.publicId,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
          current: session.id === currentSessionId,
        })),
    );
  }

  public revokeSession(
    userId: bigint,
    sessionPublicId: string,
    now: Date,
  ): Promise<{ current: boolean } | null> {
    const session = this.sessions.find(
      (candidate) =>
        candidate.userId === userId &&
        candidate.publicId === sessionPublicId &&
        candidate.revokedAt === null,
    );
    if (session === undefined) return Promise.resolve(null);
    session.revokedAt = now;
    return Promise.resolve({ current: false });
  }

  public revokeAllSessions(userId: bigint, now: Date): Promise<void> {
    this.sessions
      .filter((session) => session.userId === userId && session.revokedAt === null)
      .forEach((session) => {
        session.revokedAt = now;
      });
    return Promise.resolve();
  }

  public createPasswordReset(input: PasswordResetInput): Promise<{ email: string } | null> {
    const user = this.users.find(
      (candidate) =>
        candidate.normalizedEmail === input.normalizedEmail && candidate.status === 'ACTIVE',
    );
    if (user === undefined) return Promise.resolve(null);
    this.resets
      .filter((reset) => reset.userId === user.id && reset.usedAt === null)
      .forEach((reset) => {
        reset.usedAt = input.now;
      });
    this.resets.push({
      userId: user.id,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
    });
    return Promise.resolve({ email: user.email });
  }

  public resetPassword(
    tokenHash: string,
    passwordHash: string,
    now: Date,
    metadata: RequestMetadata,
  ): Promise<boolean> {
    void metadata;
    const reset = this.resets.find(
      (candidate) =>
        candidate.tokenHash === tokenHash && candidate.usedAt === null && candidate.expiresAt > now,
    );
    if (reset === undefined) return Promise.resolve(false);
    const user = this.users.find(({ id }) => id === reset.userId);
    if (user === undefined) return Promise.resolve(false);
    reset.usedAt = now;
    user.passwordHash = passwordHash;
    user.status = 'ACTIVE';
    void this.revokeAllSessions(user.id, now);
    return Promise.resolve(true);
  }

  public createInvitation(input: CreateInvitationInput): Promise<InvitationRecord> {
    const existingUser =
      this.users.find(({ normalizedEmail }) => normalizedEmail === input.normalizedEmail) ?? null;
    if (
      existingUser !== null &&
      this.accesses.some(
        (access) => access.userId === existingUser.id && access.tenant.id === input.tenantId,
      )
    )
      throw new IdentityConflictError('MEMBERSHIP');
    if (
      this.invitations.some(
        (invitation) =>
          invitation.tenantId === input.tenantId &&
          invitation.normalizedEmail === input.normalizedEmail &&
          invitation.status === 'PENDING',
      )
    )
      throw new IdentityConflictError('INVITATION');
    const invitation: StoredInvitation = {
      id: this.nextId++,
      publicId: input.publicId,
      tenantId: input.tenantId,
      email: input.request.email,
      normalizedEmail: input.normalizedEmail,
      roleCode: input.request.roleCode,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      status: 'PENDING',
      existingUser,
    };
    this.invitations.push(invitation);
    return Promise.resolve(invitation);
  }

  public findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const invitation = this.invitations.find((candidate) => candidate.tokenHash === tokenHash);
    if (invitation === undefined) return Promise.resolve(null);
    invitation.existingUser =
      this.users.find(({ normalizedEmail }) => normalizedEmail === invitation.normalizedEmail) ??
      null;
    return Promise.resolve(invitation);
  }

  public listInvitations(tenantId: bigint) {
    return Promise.resolve(
      this.invitations
        .filter((invitation) => invitation.tenantId === tenantId && invitation.status === 'PENDING')
        .map((invitation) => ({
          publicId: invitation.publicId,
          email: invitation.email,
          roleCode: invitation.roleCode,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
        })),
    );
  }

  public revokeInvitation(
    tenantId: bigint,
    invitationPublicId: string,
    actor: AuthRequestContext,
    metadata: RequestMetadata,
  ): Promise<boolean> {
    void actor;
    void metadata;
    const invitation = this.invitations.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.publicId === invitationPublicId &&
        candidate.status === 'PENDING',
    );
    if (invitation === undefined) return Promise.resolve(false);
    invitation.status = 'REVOKED';
    return Promise.resolve(true);
  }

  public acceptInvitation(input: AcceptInvitationInput): Promise<void> {
    const invitation = this.invitations.find(({ id }) => id === input.invitationId);
    if (invitation?.status !== 'PENDING' || invitation.expiresAt <= input.now)
      throw new IdentityConflictError('INVITATION');
    let user = this.users.find(
      ({ normalizedEmail }) => normalizedEmail === invitation.normalizedEmail,
    );
    if (user === undefined) {
      if (input.passwordHash === undefined || input.newUserPublicId === undefined) {
        throw new IdentityConflictError('STRUCTURE');
      }
      user = {
        id: this.nextId++,
        publicId: input.newUserPublicId,
        email: invitation.email,
        normalizedEmail: invitation.normalizedEmail,
        passwordHash: input.passwordHash,
        status: 'ACTIVE',
      };
      this.users.push(user);
    }
    const tenantAccess = this.accesses.find(({ tenant }) => tenant.id === invitation.tenantId);
    if (tenantAccess === undefined) throw new IdentityConflictError('STRUCTURE');
    this.accesses.push({
      userId: user.id,
      tenant: {
        ...tenantAccess.tenant,
        membership: {
          id: this.nextId++,
          publicId: input.membershipPublicId,
          status: 'ACTIVE',
          roleCode: invitation.roleCode,
          permissions: [],
          isOwner: false,
        },
      },
    });
    invitation.status = 'ACCEPTED';
    return Promise.resolve();
  }

  public listMembers(tenantId: bigint, input: MembershipListInput): Promise<MembershipListResult> {
    let members = [...(this.members.get(tenantId) ?? [])];
    const email = input.email;
    if (email !== undefined)
      members = members.filter((member) =>
        member.user.email.toLowerCase().includes(email.toLowerCase()),
      );
    if (input.roleCode !== undefined)
      members = members.filter((member) => member.roleCode === input.roleCode);
    if (input.status !== undefined)
      members = members.filter((member) => member.status === input.status);
    members.sort((left, right) => {
      const leftValue =
        input.orderBy === 'email'
          ? left.user.email
          : input.orderBy === 'roleCode'
            ? left.roleCode
            : input.orderBy === 'status'
              ? left.status
              : left.createdAt;
      const rightValue =
        input.orderBy === 'email'
          ? right.user.email
          : input.orderBy === 'roleCode'
            ? right.roleCode
            : input.orderBy === 'status'
              ? right.status
              : right.createdAt;
      const comparison = leftValue.localeCompare(rightValue);
      return input.direction === 'asc' ? comparison : -comparison;
    });
    const total = members.length;
    return Promise.resolve({
      members: members.slice((input.page - 1) * input.limit, input.page * input.limit),
      page: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    });
  }

  public updateMembership(
    tenantId: bigint,
    membershipPublicId: string,
    request: UpdateMembershipRequest,
    actor: AuthRequestContext,
    metadata: RequestMetadata,
  ): Promise<MembershipPublic | null> {
    void actor;
    void metadata;
    const membership = this.members
      .get(tenantId)
      ?.find(({ publicId }) => publicId === membershipPublicId);
    if (membership === undefined) return Promise.resolve(null);
    if (membership.isOwner) throw new IdentityConflictError('MEMBERSHIP');
    if (request.roleCode !== undefined) membership.roleCode = request.roleCode;
    if (request.status !== undefined) membership.status = request.status;
    return Promise.resolve(membership);
  }

  public recordAudit(input: AuditInput): Promise<void> {
    this.audits.push(structuredClone(input));
    return Promise.resolve();
  }

  public setUserStatus(userId: bigint, status: UserStatus): Promise<void> {
    const user = this.users.find(({ id }) => id === userId);
    if (user !== undefined) user.status = status;
    return Promise.resolve();
  }
}
