import { CommercialRole, Prisma } from '../../database-client/client.js';

export type CommercialScope =
  | { type: 'GLOBAL' }
  | { type: 'MANAGER'; accountId: bigint; managerId: bigint }
  | { type: 'REPRESENTATIVE'; accountId: bigint; managerId: bigint; representativeId: bigint }
  | { type: 'SELLER'; accountId: bigint; managerId: bigint; representativeId?: bigint; sellerId: bigint };

export async function getCommercialScopeForUser(
  userId: bigint,
  prisma: any,
): Promise<CommercialScope | null> {
  const account = await prisma.commercialAccount.findFirst({
    where: { userId },
    include: { parent: true },
  });

  if (!account) return null;

  if (account.role === CommercialRole.MANAGER) {
    return {
      type: 'MANAGER',
      accountId: account.id,
      managerId: account.id,
    };
  }

  if (account.role === CommercialRole.REPRESENTATIVE) {
    const manager = await getManagerAncestor(account.id, prisma);
    if (!manager) return null;

    return {
      type: 'REPRESENTATIVE',
      accountId: account.id,
      managerId: manager.id,
      representativeId: account.id,
    };
  }

  if (account.role === CommercialRole.SELLER) {
    const manager = await getManagerAncestor(account.id, prisma);
    if (!manager) return null;

    const representative = account.parentId && account.parent?.role === CommercialRole.REPRESENTATIVE ? account.parent : null;

    return {
      type: 'SELLER',
      accountId: account.id,
      managerId: manager.id,
      representativeId: representative?.id,
      sellerId: account.id,
    };
  }

  return null;
}

export async function getManagerAncestor(
  accountId: bigint,
  prisma: any,
): Promise<any | null> {
  let current = await prisma.commercialAccount.findUnique({
    where: { id: accountId },
    include: { parent: true },
  });

  while (current) {
    if (current.role === CommercialRole.MANAGER) {
      return current;
    }
    if (!current.parentId) {
      return null;
    }
    current = current.parent;
  }

  return null;
}

export function buildCommercialTenantWhere(scope: CommercialScope): Prisma.TenantWhereInput {
  if (scope.type === 'GLOBAL') {
    return {};
  }

  if (scope.type === 'MANAGER') {
    return {
      commercialAssignment: {
        managerId: scope.managerId,
      },
    };
  }

  if (scope.type === 'REPRESENTATIVE') {
    return {
      commercialAssignment: {
        representativeId: scope.representativeId,
      },
    };
  }

  if (scope.type === 'SELLER') {
    return {
      commercialAssignment: {
        sellerId: scope.sellerId,
      },
    };
  }

  return {};
}

export async function assertCommercialAccessToTenant(
  tenantId: bigint,
  scope: CommercialScope,
  prisma: any,
): Promise<void> {
  if (scope.type === 'GLOBAL') {
    return;
  }

  const assignment = await prisma.tenantCommercialAssignment.findUnique({
    where: { tenantId },
  });

  if (!assignment) {
    throw new Error('TENANT_NOT_FOUND');
  }

  if (scope.type === 'MANAGER' && assignment.managerId !== scope.managerId) {
    throw new Error('UNAUTHORIZED');
  }

  if (scope.type === 'REPRESENTATIVE' && assignment.representativeId !== scope.representativeId) {
    throw new Error('UNAUTHORIZED');
  }

  if (scope.type === 'SELLER' && assignment.sellerId !== scope.sellerId) {
    throw new Error('UNAUTHORIZED');
  }
}
