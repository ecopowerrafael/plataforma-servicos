import { randomUUID } from 'node:crypto';

type AssignmentResult =
  | { assigned: true; managerPublicId: string; regionPublicId: string }
  | { assigned: false; reason: 'ASSIGNMENT_EXISTS' | 'NO_TERRITORY' | 'NO_REGION_FOUND' | 'MANAGER_INACTIVE' | 'AMBIGUOUS_REGION' | 'CONFLICT' };

const normalize = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

/** Assigns only previously-unassigned tenants to an active manager territory. */
export class TenantTerritoryAssignmentService {
  public constructor(private readonly prisma: any) {}

  public async assignTenantByTerritory(tenantId: bigint): Promise<AssignmentResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { businessUnits: { where: { isHeadquarters: true }, take: 1 } },
    });
    if (!tenant) return { assigned: false, reason: 'NO_TERRITORY' };

    const existing = await this.prisma.tenantCommercialAssignment.findUnique({ where: { tenantId } });
    if (existing) return { assigned: false, reason: 'ASSIGNMENT_EXISTS' };

    const unit = tenant.businessUnits[0];
    const city = unit?.city?.trim();
    const state = unit?.state?.trim().toUpperCase();
    if (!city || !state) return { assigned: false, reason: 'NO_TERRITORY' };

    const candidates = await this.prisma.commercialRegionCity.findMany({
      where: { state, region: { active: true, manager: { role: 'MANAGER', active: true } } },
      include: { region: { include: { manager: true } } },
    });
    const matches = candidates.filter((item: any) => normalize(item.city) === normalize(city));
    if (matches.length === 0) return { assigned: false, reason: 'NO_REGION_FOUND' };
    if (matches.length > 1) return { assigned: false, reason: 'AMBIGUOUS_REGION' };

    const match = matches[0];
    if (!match.region.manager.active) return { assigned: false, reason: 'MANAGER_INACTIVE' };
    try {
      await this.prisma.tenantCommercialAssignment.create({
        data: { tenantId, managerId: match.region.managerId, representativeId: null, sellerId: null, source: 'REGION_AUTO' },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') return { assigned: false, reason: 'CONFLICT' };
      throw error;
    }
    await this.prisma.auditLog.create({ data: {
      publicId: randomUUID(), action: 'commercial.tenant_assignment.auto_created', targetType: 'tenant_assignment', targetPublicId: tenant.publicId, tenantId,
      metadata: { tenantPublicId: tenant.publicId, managerPublicId: match.region.manager.publicId, regionPublicId: match.region.publicId, ibgeCode: match.ibgeCode, city, state, source: 'TERRITORY' },
    } });
    return { assigned: true, managerPublicId: match.region.manager.publicId, regionPublicId: match.region.publicId };
  }
}
