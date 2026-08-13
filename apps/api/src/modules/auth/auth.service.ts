import {
  normalizeEmail,
  type AcceptInvitationRequest,
  type AuthenticatedTenant,
  type CreateInvitationRequest,
  type CreateTenantWithOwnerRequest,
  type CreateTenantWithOwnerResponse,
  type LoginRequest,
  type LoginResponse,
  type MembershipPublic,
  type PermissionCode,
  type SessionPublic,
  type UpdateMembershipRequest,
} from '@plataforma/shared';

import {
  type AuthRequestContext,
  type AuthorizedTenantContext,
  type IdentityRepository,
  IdentityConflictError,
  type MembershipListInput,
  type MembershipListResult,
  type RequestMetadata,
} from './identity.repository.js';
import { type AccountMessageDelivery, type AccountMessage } from './message-delivery.js';
import { type PasswordService } from './password.service.js';
import { generateOpaqueToken, generatePublicId, hashOpaqueToken } from './token.service.js';
import { AppError } from '../../errors/AppError.js';

interface AuthOptions {
  sessionTtlHours: number;
  maxActiveSessions: number;
  passwordResetTtlMinutes: number;
  invitationTtlHours: number;
  appWebUrl: string;
}

let sharedDummyPasswordHash: Promise<string> | undefined;

export interface LoginResult extends LoginResponse {
  rawSessionToken: string;
  sessionExpiresAt: Date;
}

const genericCredentialsError = () =>
  new AppError({
    code: 'AUTH_INVALID_CREDENTIALS',
    message: 'E-mail ou senha inválidos.',
    statusCode: 401,
  });

function invitationError(): AppError {
  return new AppError({
    code: 'INVITATION_INVALID',
    message: 'O convite é inválido, expirou ou já foi utilizado.',
    statusCode: 400,
  });
}

function isoTenant(tenant: AuthorizedTenantContext): AuthenticatedTenant {
  return {
    tenant: {
      publicId: tenant.publicId,
      slug: tenant.slug,
      displayName: tenant.displayName,
      status: tenant.status,
      timezone: tenant.timezone,
      locale: tenant.locale,
      currency: tenant.currency,
    },
    membership: {
      publicId: tenant.membership.publicId,
      roleCode: tenant.membership.roleCode,
      permissions: tenant.membership.permissions as PermissionCode[],
      unitPublicIds: tenant.membership.unitPublicIds ?? null,
    },
  };
}

export class AuthService {
  private constructor(
    private readonly repository: IdentityRepository,
    private readonly passwords: PasswordService,
    private readonly delivery: AccountMessageDelivery,
    private readonly options: AuthOptions,
  ) {}

  /**
   * Construção sem I/O: o hash dummy usado contra enumeração de usuários é
   * calculado sob demanda (Argon2 leva centenas de ms e não pode atrasar o
   * `listen()` do servidor).
   */
  public static create(
    repository: IdentityRepository,
    passwords: PasswordService,
    delivery: AccountMessageDelivery,
    options: AuthOptions,
  ): AuthService {
    return new AuthService(repository, passwords, delivery, options);
  }

  /** Aquecimento opcional, disparado depois que a API já está ouvindo. */
  public warmUp(): Promise<string> {
    return this.dummyHash();
  }

  private dummyHash(): Promise<string> {
    sharedDummyPasswordHash ??= this.passwords.hash(generateOpaqueToken());
    return sharedDummyPasswordHash;
  }

  public async createTenantWithOwner(
    request: CreateTenantWithOwnerRequest,
  ): Promise<CreateTenantWithOwnerResponse> {
    const passwordHash = await this.passwords.hash(request.owner.password);
    try {
      return await this.repository.createTenantWithOwner({
        request,
        passwordHash,
        tenantPublicId: generatePublicId(),
        unitPublicId: generatePublicId(),
        userPublicId: generatePublicId(),
        membershipPublicId: generatePublicId(),
      });
    } catch (error) {
      if (error instanceof IdentityConflictError) {
        const emailConflict = error.conflict === 'EMAIL';
        throw new AppError({
          code: emailConflict ? 'MEMBERSHIP_CONFLICT' : 'TENANT_STRUCTURE_CONFLICT',
          message: emailConflict
            ? 'O e-mail do proprietário já está cadastrado.'
            : 'Não foi possível criar a estrutura com os identificadores informados.',
          statusCode: 409,
          cause: error,
        });
      }
      throw error;
    }
  }

  public async login(request: LoginRequest, metadata: RequestMetadata): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(request.email);
    const user = await this.repository.findUserByNormalizedEmail(normalizedEmail);
    // Usuário inexistente continua pagando o mesmo custo de verificação.
    const passwordHash = user?.passwordHash ?? (await this.dummyHash());
    const passwordMatches = await this.passwords.verify(passwordHash, request.password);

    if (user?.status !== 'ACTIVE' || user.passwordHash === null || !passwordMatches) {
      await this.repository.recordAudit({
        action: 'auth.login.failure',
        targetType: 'authentication',
        ...(user === null ? {} : { userId: user.id }),
        metadata: { reason: 'INVALID_CREDENTIALS' },
        ...metadata,
      });
      throw genericCredentialsError();
    }

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.repository.updatePasswordHash(
        user.id,
        await this.passwords.hash(request.password),
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlHours * 3_600_000);
    const rawSessionToken = generateOpaqueToken();
    const session = await this.repository.createLoginSession({
      userId: user.id,
      publicId: generatePublicId(),
      tokenHash: hashOpaqueToken(rawSessionToken),
      expiresAt,
      now,
      maxActiveSessions: this.options.maxActiveSessions,
      ...metadata,
    });
    const tenants = await this.repository.listAvailableTenants(user.id);
    return {
      user: { publicId: user.publicId, email: user.email, status: user.status },
      tenants,
      requiresTenantSelection: tenants.length !== 1,
      rawSessionToken,
      sessionExpiresAt: session.expiresAt,
    };
  }

  public async authenticate(rawToken: string | undefined): Promise<AuthRequestContext> {
    if (rawToken === undefined || rawToken.length < 32) {
      throw new AppError({
        code: 'AUTH_REQUIRED',
        message: 'Autenticação obrigatória.',
        statusCode: 401,
      });
    }
    const session = await this.repository.findSessionByTokenHash(hashOpaqueToken(rawToken));
    if (session?.revokedAt !== null) {
      throw new AppError({
        code: 'SESSION_INVALID',
        message: 'A sessão é inválida.',
        statusCode: 401,
      });
    }
    const now = new Date();
    if (session.expiresAt <= now) {
      throw new AppError({
        code: 'SESSION_EXPIRED',
        message: 'A sessão expirou.',
        statusCode: 401,
      });
    }
    if (session.user.status !== 'ACTIVE') {
      throw new AppError({
        code: 'USER_INACTIVE',
        message: 'O acesso do usuário está bloqueado.',
        statusCode: 403,
      });
    }
    if (now.getTime() - session.lastSeenAt.getTime() >= 300_000) {
      await this.repository.touchSession(session.id, now);
    }
    return {
      user: {
        id: session.user.id,
        publicId: session.user.publicId,
        email: session.user.email,
        status: session.user.status,
      },
      session: { id: session.id, publicId: session.publicId, expiresAt: session.expiresAt },
    };
  }

  public async authenticateOptional(
    rawToken: string | undefined,
  ): Promise<AuthRequestContext | null> {
    if (rawToken === undefined) return null;
    return this.authenticate(rawToken);
  }

  public async resolveTenant(
    auth: AuthRequestContext,
    tenantPublicId: string,
  ): Promise<AuthorizedTenantContext> {
    const tenant = await this.repository.findAuthorizedTenant(auth.user.id, tenantPublicId);
    if (tenant === null) {
      throw new AppError({
        code: 'TENANT_ACCESS_DENIED',
        message: 'O usuário não possui acesso ao estabelecimento informado.',
        statusCode: 403,
      });
    }
    if (tenant.membership.status !== 'ACTIVE') {
      throw new AppError({
        code: 'MEMBERSHIP_INACTIVE',
        message: 'O vínculo com o estabelecimento está bloqueado.',
        statusCode: 403,
      });
    }
    const tenantErrors = {
      SUSPENDED: ['TENANT_SUSPENDED', 'O estabelecimento está temporariamente suspenso.'],
      INACTIVE: ['TENANT_INACTIVE', 'O estabelecimento está inativo.'],
      PENDING: ['TENANT_PENDING', 'O estabelecimento ainda não está liberado.'],
    } as const;
    if (tenant.status !== 'ACTIVE') {
      const [code, message] = tenantErrors[tenant.status];
      throw new AppError({ code, message, statusCode: 403 });
    }
    return tenant;
  }

  public requirePermission(tenant: AuthorizedTenantContext, permission: PermissionCode): void {
    if (!tenant.membership.permissions.includes(permission)) {
      throw new AppError({
        code: 'PERMISSION_DENIED',
        message: 'O usuário não possui permissão para esta operação.',
        statusCode: 403,
      });
    }
  }

  public async me(auth: AuthRequestContext, selectedTenantId?: string) {
    const tenants = await this.repository.listAvailableTenants(auth.user.id);
    const currentTenant =
      selectedTenantId === undefined
        ? null
        : isoTenant(await this.resolveTenant(auth, selectedTenantId));
    const sessions = await this.repository.listSessions(auth.user.id, auth.session.id);
    const currentSession = sessions.find(({ current }) => current);
    if (currentSession === undefined) throw new Error('A sessão atual não foi encontrada.');
    return {
      user: {
        publicId: auth.user.publicId,
        email: auth.user.email,
        status: auth.user.status,
      },
      tenants,
      requiresTenantSelection: tenants.length !== 1,
      session: currentSession,
      currentTenant,
    };
  }

  public listSessions(auth: AuthRequestContext): Promise<SessionPublic[]> {
    return this.repository.listSessions(auth.user.id, auth.session.id);
  }

  public async revokeSession(
    auth: AuthRequestContext,
    sessionPublicId: string,
    metadata: RequestMetadata,
  ): Promise<boolean> {
    const revoked = await this.repository.revokeSession(auth.user.id, sessionPublicId, new Date());
    if (revoked === null) {
      throw new AppError({
        code: 'SESSION_NOT_FOUND',
        message: 'A sessão não foi encontrada.',
        statusCode: 404,
      });
    }
    await this.repository.recordAudit({
      action: 'auth.session.revoked',
      targetType: 'user_session',
      targetPublicId: sessionPublicId,
      userId: auth.user.id,
      sessionId: auth.session.id,
      ...metadata,
    });
    return sessionPublicId === auth.session.publicId;
  }

  public async logout(auth: AuthRequestContext, metadata: RequestMetadata): Promise<void> {
    await this.repository.revokeSession(auth.user.id, auth.session.publicId, new Date());
    await this.repository.recordAudit({
      action: 'auth.logout',
      targetType: 'user_session',
      targetPublicId: auth.session.publicId,
      userId: auth.user.id,
      sessionId: auth.session.id,
      ...metadata,
    });
  }

  public async logoutAll(auth: AuthRequestContext, metadata: RequestMetadata): Promise<void> {
    await this.repository.recordAudit({
      action: 'auth.logout_all',
      targetType: 'user',
      targetPublicId: auth.user.publicId,
      userId: auth.user.id,
      sessionId: auth.session.id,
      ...metadata,
    });
    await this.repository.revokeAllSessions(auth.user.id, new Date());
  }

  public async forgotPassword(email: string, metadata: RequestMetadata): Promise<void> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.options.passwordResetTtlMinutes * 60_000);
    const result = await this.repository.createPasswordReset({
      normalizedEmail: normalizeEmail(email),
      tokenHash: hashOpaqueToken(token),
      expiresAt,
      now: new Date(),
      ...metadata,
    });
    if (result === null) return;
    const message: AccountMessage = {
      recipient: result.email,
      kind: 'PASSWORD_RESET',
      actionUrl: `${this.options.appWebUrl}/reset-password?token=${encodeURIComponent(token)}`,
      expiresAt,
    };
    try {
      await this.delivery.deliver(message);
    } catch {
      await this.repository.recordAudit({
        action: 'auth.password_reset.delivery_failed',
        targetType: 'message_delivery',
        metadata: { kind: 'PASSWORD_RESET' },
        ...metadata,
      });
    }
  }

  public async resetPassword(token: string, newPassword: string, metadata: RequestMetadata) {
    const updated = await this.repository.resetPassword(
      hashOpaqueToken(token),
      await this.passwords.hash(newPassword),
      new Date(),
      metadata,
    );
    if (!updated)
      throw new AppError({
        code: 'PASSWORD_RESET_INVALID',
        message: 'O token de redefinição é inválido, expirou ou já foi utilizado.',
        statusCode: 400,
      });
  }

  public async createInvitation(
    auth: AuthRequestContext,
    tenant: AuthorizedTenantContext,
    request: CreateInvitationRequest,
    metadata: RequestMetadata,
  ) {
    if (!this.delivery.available) {
      throw new AppError({
        code: 'MESSAGE_DELIVERY_UNAVAILABLE',
        message: 'O envio de convites não está configurado.',
        statusCode: 503,
      });
    }
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.options.invitationTtlHours * 3_600_000);
    try {
      const invitation = await this.repository.createInvitation({
        tenantId: tenant.id,
        invitedByUserId: auth.user.id,
        invitedBySessionId: auth.session.id,
        request,
        normalizedEmail: normalizeEmail(request.email),
        publicId: generatePublicId(),
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        ...metadata,
      });
      try {
        await this.delivery.deliver({
          recipient: invitation.email,
          kind: 'INVITATION',
          actionUrl: `${this.options.appWebUrl}/accept-invitation?token=${encodeURIComponent(token)}`,
          expiresAt,
        });
      } catch (error) {
        await this.repository.revokeInvitation(tenant.id, invitation.publicId, auth, metadata);
        await this.repository.recordAudit({
          action: 'auth.invitation.delivery_failed',
          targetType: 'user_invitation',
          targetPublicId: invitation.publicId,
          tenantId: tenant.id,
          userId: auth.user.id,
          sessionId: auth.session.id,
          metadata: { kind: 'INVITATION' },
          ...metadata,
        });
        throw new AppError({
          code: 'MESSAGE_DELIVERY_FAILED',
          message: 'Não foi possível enviar o convite. Tente novamente.',
          statusCode: 503,
          cause: error,
        });
      }
      return {
        publicId: invitation.publicId,
        email: invitation.email,
        roleCode: request.roleCode,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof IdentityConflictError) {
        throw new AppError({
          code: error.conflict === 'MEMBERSHIP' ? 'MEMBERSHIP_CONFLICT' : 'INVITATION_CONFLICT',
          message: 'Já existe um vínculo ou convite ativo para este e-mail.',
          statusCode: 409,
          cause: error,
        });
      }
      throw error;
    }
  }

  public async acceptInvitation(
    request: AcceptInvitationRequest,
    auth: AuthRequestContext | null,
    metadata: RequestMetadata,
  ): Promise<void> {
    const invitation = await this.repository.findInvitationByTokenHash(
      hashOpaqueToken(request.token),
    );
    if (invitation?.status !== 'PENDING' || invitation.expiresAt <= new Date())
      throw invitationError();

    let passwordHash: string | undefined;
    let newUserPublicId: string | undefined;
    if (invitation.existingUser === null) {
      if (request.password === undefined) throw invitationError();
      passwordHash = await this.passwords.hash(request.password);
      newUserPublicId = generatePublicId();
    } else {
      const sameAuthenticatedUser = auth?.user.id === invitation.existingUser.id;
      if (auth !== null && !sameAuthenticatedUser) throw invitationError();
      const currentPasswordValid =
        auth === null &&
        request.currentPassword !== undefined &&
        invitation.existingUser.passwordHash !== null
          ? await this.passwords.verify(
              invitation.existingUser.passwordHash,
              request.currentPassword,
            )
          : false;
      if (!sameAuthenticatedUser && !currentPasswordValid) throw invitationError();
    }
    try {
      await this.repository.acceptInvitation({
        invitationId: invitation.id,
        ...(passwordHash === undefined ? {} : { passwordHash }),
        ...(newUserPublicId === undefined ? {} : { newUserPublicId }),
        membershipPublicId: generatePublicId(),
        now: new Date(),
        ...metadata,
      });
    } catch (error) {
      if (error instanceof IdentityConflictError) throw invitationError();
      throw error;
    }
  }

  public async revokeInvitation(
    auth: AuthRequestContext,
    tenant: AuthorizedTenantContext,
    invitationPublicId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const revoked = await this.repository.revokeInvitation(
      tenant.id,
      invitationPublicId,
      auth,
      metadata,
    );
    if (!revoked) {
      throw new AppError({
        code: 'INVITATION_INVALID',
        message: 'O convite não foi encontrado ou não está pendente.',
        statusCode: 404,
      });
    }
  }

  public listMembers(tenantId: bigint, input: MembershipListInput): Promise<MembershipListResult> {
    return this.repository.listMembers(tenantId, input);
  }

  public listInvitations(tenantId: bigint) {
    return this.repository.listInvitations(tenantId);
  }

  public async updateMembership(
    tenant: AuthorizedTenantContext,
    membershipPublicId: string,
    request: UpdateMembershipRequest,
    auth: AuthRequestContext,
    metadata: RequestMetadata,
  ): Promise<MembershipPublic> {
    try {
      const membership = await this.repository.updateMembership(
        tenant.id,
        membershipPublicId,
        request,
        auth,
        metadata,
      );
      if (membership === null)
        throw new AppError({
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'O vínculo não foi encontrado.',
          statusCode: 404,
        });
      return membership;
    } catch (error) {
      if (error instanceof IdentityConflictError)
        throw new AppError({
          code: error.conflict === 'MEMBERSHIP' ? 'OWNER_PROTECTED' : 'MEMBERSHIP_CONFLICT',
          message:
            error.conflict === 'MEMBERSHIP'
              ? 'O vínculo do proprietário principal não pode ser alterado.'
              : 'A alteração solicitada não é permitida.',
          statusCode: 409,
          cause: error,
        });
      throw error;
    }
  }
}
