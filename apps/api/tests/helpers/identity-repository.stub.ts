import { vi } from 'vitest';

import { type IdentityRepository } from '../../src/modules/auth/identity.repository.js';

export function identityRepositoryStub(): IdentityRepository {
  return {
    createTenantWithOwner: vi.fn(),
    findUserByNormalizedEmail: vi.fn().mockResolvedValue(null),
    createLoginSession: vi.fn(),
    updatePasswordHash: vi.fn(),
    findSessionByTokenHash: vi.fn().mockResolvedValue(null),
    touchSession: vi.fn(),
    listAvailableTenants: vi.fn().mockResolvedValue([]),
    findAuthorizedTenant: vi.fn().mockResolvedValue(null),
    listSessions: vi.fn().mockResolvedValue([]),
    revokeSession: vi.fn().mockResolvedValue(null),
    revokeAllSessions: vi.fn(),
    createPasswordReset: vi.fn().mockResolvedValue(null),
    resetPassword: vi.fn().mockResolvedValue(false),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn().mockResolvedValue(false),
    findInvitationByTokenHash: vi.fn().mockResolvedValue(null),
    listInvitations: vi.fn().mockResolvedValue([]),
    acceptInvitation: vi.fn(),
    listMembers: vi.fn().mockResolvedValue([]),
    updateMembership: vi.fn().mockResolvedValue(null),
    recordAudit: vi.fn(),
    setUserStatus: vi.fn(),
  };
}
