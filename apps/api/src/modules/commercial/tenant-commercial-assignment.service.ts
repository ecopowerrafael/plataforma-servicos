import { CommercialAssignmentSource, CommercialRole } from '../../database-client/client.js';
import { getCommercialScopeForUser, getManagerAncestor } from './commercial-scope.helper.js';

interface AssignmentInput {
  tenantId: bigint;
  creatorUserId?: bigint;
  ibgeCode?: string;
  source?: CommercialAssignmentSource;
}

export class TenantCommercialAssignmentService {
  constructor(private prisma: any) {}

  async assignTenantCommercialOwnership(input: AssignmentInput) {
    let managerId: bigint | null = null;
    let representativeId: bigint | null = null;
    let sellerId: bigint | null = null;
    let source = input.source || CommercialAssignmentSource.REGION_AUTO;

    // If creator is provided, resolve based on their commercial account
    if (input.creatorUserId) {
      const scope = await getCommercialScopeForUser(input.creatorUserId, this.prisma);

      if (scope && scope.type !== 'GLOBAL') {
        managerId = scope.managerId;
        representativeId = scope.type === 'REPRESENTATIVE' ? scope.representativeId : null;
        sellerId = scope.type === 'SELLER' ? scope.sellerId : null;

        // Determine source
        const account = await this.prisma.commercialAccount.findUnique({
          where: { id: scope.accountId },
        });

        if (account?.role === CommercialRole.MANAGER) {
          source = CommercialAssignmentSource.CREATED_BY_MANAGER;
        } else if (account?.role === CommercialRole.REPRESENTATIVE) {
          source = CommercialAssignmentSource.CREATED_BY_REPRESENTATIVE;
        } else if (account?.role === CommercialRole.SELLER) {
          source = CommercialAssignmentSource.CREATED_BY_SELLER;
        }
      } else {
        // Global admin creating tenant - try to find manager by region
        if (input.ibgeCode) {
          const city = await this.prisma.commercialRegionCity.findUnique({
            where: { ibgeCode: input.ibgeCode },
            include: { region: true },
          });

          if (city?.region) {
            managerId = city.region.managerId;
            source = CommercialAssignmentSource.REGION_AUTO;
          }
        }

        source = CommercialAssignmentSource.GLOBAL_ADMIN;
      }
    } else if (input.ibgeCode) {
      // No creator - try to resolve from region
      const city = await this.prisma.commercialRegionCity.findUnique({
        where: { ibgeCode: input.ibgeCode },
        include: { region: true },
      });

      if (city?.region) {
        managerId = city.region.managerId;
      }
    }

    // Check if assignment already exists
    const existing = await this.prisma.tenantCommercialAssignment.findUnique({
      where: { tenantId: input.tenantId },
    });

    if (existing) {
      // Update instead of create
      return this.prisma.tenantCommercialAssignment.update({
        where: { tenantId: input.tenantId },
        data: {
          managerId,
          representativeId,
          sellerId,
          source,
          assignedAt: new Date(),
          assignedByUserId: input.creatorUserId || null,
        },
      });
    }

    // Create new assignment
    return this.prisma.tenantCommercialAssignment.create({
      data: {
        tenantId: input.tenantId,
        managerId,
        representativeId,
        sellerId,
        source,
        assignedByUserId: input.creatorUserId || null,
      },
    });
  }

  async getTenantAssignment(tenantId: bigint) {
    return this.prisma.tenantCommercialAssignment.findUnique({
      where: { tenantId },
      include: {
        manager: { include: { user: true } },
        representative: { include: { user: true } },
        seller: { include: { user: true } },
      },
    });
  }

  async getTenantsByManager(managerId: bigint) {
    return this.prisma.tenantCommercialAssignment.findMany({
      where: { managerId },
      include: { tenant: true, representative: true, seller: true },
    });
  }

  async getTenantsByRepresentative(representativeId: bigint) {
    return this.prisma.tenantCommercialAssignment.findMany({
      where: { representativeId },
      include: { tenant: true, manager: true, seller: true },
    });
  }

  async getTenantsBySeller(sellerId: bigint) {
    return this.prisma.tenantCommercialAssignment.findMany({
      where: { sellerId },
      include: { tenant: true, manager: true, representative: true },
    });
  }
}
