import { type Prisma, type PrismaClient } from '../../database-client/client.js';
export class PrismaProfessionalUnitRepository {
  public constructor(private readonly client: PrismaClient) {}
  public findProfessional(tenantId: bigint, id: string) {
    return this.client.professional.findFirst({ where: { tenantId, publicId: id } });
  }
  public findUnit(tenantId: bigint, id: string) {
    return this.client.businessUnit.findFirst({
      where: { tenantId, publicId: id, status: 'ACTIVE' },
    });
  }
  public listByProfessional(tenantId: bigint, id: string) {
    return this.client.professionalUnit.findMany({
      where: { tenantId, professional: { publicId: id } },
      include: { professional: true, unit: true },
    });
  }
  public listByUnit(tenantId: bigint, id: string) {
    return this.client.professionalUnit.findMany({
      where: { tenantId, unit: { publicId: id } },
      include: { professional: true, unit: true },
    });
  }
  public find(tenantId: bigint, professionalId: bigint, unitId: bigint) {
    return this.client.professionalUnit.findFirst({
      where: { tenantId, professionalId, unitId },
      include: { professional: true, unit: true },
    });
  }
  public upsert(data: Prisma.ProfessionalUnitUncheckedCreateInput) {
    return this.client.professionalUnit.upsert({
      where: {
        professionalId_unitId: {
          professionalId: data.professionalId,
          unitId: data.unitId,
        },
      },
      create: data,
      update: data,
      include: { professional: true, unit: true },
    });
  }
  public update(id: bigint, data: Prisma.ProfessionalUnitUncheckedUpdateInput) {
    return this.client.professionalUnit.update({ where: { id }, data });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
