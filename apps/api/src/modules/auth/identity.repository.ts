import {
  type AuthenticatedTenant,
  type AvailableTenant,
  type CreateInvitationRequest,
  type CreateTenantWithOwnerRequest,
  type CreateTenantWithOwnerResponse,
  type InvitationPublic,
  type MembershipPublic,
  type MembershipStatus,
  type SessionPublic,
  type UpdateMembershipRequest,
  type UserPublic,
  type UserStatus,
} from '@plataforma/shared';

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthUserRecord extends UserPublic {
  id: bigint;
  normalizedEmail: string;
  passwordHash: string | null;
}

export interface AuthSessionRecord {
  id: bigint;
  publicId: string;
  userId: bigint;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  user: AuthUserRecord;
}

export interface AuthRequestContext {
  user: Pick<AuthUserRecord, 'id' | 'publicId' | 'email' | 'status'>;
  session: Pick<AuthSessionRecord, 'id' | 'publicId' | 'expiresAt'>;
}

export interface AuthorizedTenantContext extends Omit<AuthenticatedTenant['tenant'], 'status'> {
  id: bigint;
  status: AuthenticatedTenant['tenant']['status'];
  membership: {
    id: bigint;
    publicId: string;
    status: MembershipStatus;
    roleCode: string;
    permissions: string[];
    isOwner: boolean;
    unitPublicIds?: string[] | null;
  };
}

export interface CreateLoginSessionInput extends RequestMetadata {
  userId: bigint;
  publicId: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  maxActiveSessions: number;
}

export interface CreateTenantOwnerInput {
  request: CreateTenantWithOwnerRequest;
  passwordHash: string;
  tenantPublicId: string;
  unitPublicId: string;
  userPublicId: string;
  membershipPublicId: string;
}

export interface AuditInput extends RequestMetadata {
  action: string;
  targetType: string;
  targetPublicId?: string;
  tenantId?: bigint;
  userId?: bigint;
  sessionId?: bigint;
  metadata?: Record<string, boolean | null | string>;
}

export interface PasswordResetInput extends RequestMetadata {
  normalizedEmail: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface InvitationRecord {
  id: bigint;
  publicId: string;
  tenantId: bigint;
  email: string;
  normalizedEmail: string;
  roleCode: string;
  expiresAt: Date;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  existingUser: AuthUserRecord | null;
}

export interface MembershipListInput {
  page: number;
  limit: number;
  email?: string | undefined;
  roleCode?: string | undefined;
  status?: MembershipStatus | undefined;
  orderBy: 'createdAt' | 'email' | 'roleCode' | 'status';
  direction: 'asc' | 'desc';
}

export interface MembershipListResult {
  members: MembershipPublic[];
  page: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateInvitationInput extends RequestMetadata {
  tenantId: bigint;
  invitedByUserId: bigint;
  invitedBySessionId: bigint;
  request: CreateInvitationRequest;
  normalizedEmail: string;
  publicId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AcceptInvitationInput extends RequestMetadata {
  invitationId: bigint;
  passwordHash?: string;
  newUserPublicId?: string;
  membershipPublicId: string;
  now: Date;
}

export type IdentityConflict = 'EMAIL' | 'TENANT_SLUG' | 'INVITATION' | 'MEMBERSHIP' | 'STRUCTURE';

export class IdentityConflictError extends Error {
  public constructor(public readonly conflict: IdentityConflict) {
    super('Um valor único da estrutura de identidade já está em uso.');
    this.name = 'IdentityConflictError';
  }
}

export interface IdentityRepository {
  createTenantWithOwner(input: CreateTenantOwnerInput): Promise<CreateTenantWithOwnerResponse>;
  findUserByNormalizedEmail(normalizedEmail: string): Promise<AuthUserRecord | null>;
  createLoginSession(input: CreateLoginSessionInput): Promise<AuthSessionRecord>;
  updatePasswordHash(userId: bigint, passwordHash: string): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  touchSession(sessionId: bigint, now: Date): Promise<void>;
  listAvailableTenants(userId: bigint): Promise<AvailableTenant[]>;
  findAuthorizedTenant(
    userId: bigint,
    tenantPublicId: string,
  ): Promise<AuthorizedTenantContext | null>;
  listSessions(userId: bigint, currentSessionId: bigint): Promise<SessionPublic[]>;
  revokeSession(
    userId: bigint,
    sessionPublicId: string,
    now: Date,
  ): Promise<{ current: boolean } | null>;
  revokeAllSessions(userId: bigint, now: Date): Promise<void>;
  createPasswordReset(input: PasswordResetInput): Promise<{ email: string } | null>;
  resetPassword(
    tokenHash: string,
    passwordHash: string,
    now: Date,
    metadata: RequestMetadata,
  ): Promise<boolean>;
  createInvitation(input: CreateInvitationInput): Promise<InvitationRecord>;
  revokeInvitation(
    tenantId: bigint,
    invitationPublicId: string,
    actor: AuthRequestContext,
    metadata: RequestMetadata,
  ): Promise<boolean>;
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  acceptInvitation(input: AcceptInvitationInput): Promise<void>;
  listInvitations(tenantId: bigint): Promise<InvitationPublic[]>;
  listMembers(tenantId: bigint, input: MembershipListInput): Promise<MembershipListResult>;
  updateMembership(
    tenantId: bigint,
    membershipPublicId: string,
    request: UpdateMembershipRequest,
    actor: AuthRequestContext,
    metadata: RequestMetadata,
  ): Promise<MembershipPublic | null>;
  recordAudit(input: AuditInput): Promise<void>;
  setUserStatus(userId: bigint, status: UserStatus): Promise<void>;
}
