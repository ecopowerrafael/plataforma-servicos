import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class PrismaProfessionalUnavailabilityRepository {
  public constructor(private readonly client: PrismaClient) {}

  public findProfessional(tenantId: bigint, publicId: string) {
    return this.client.professional.findFirst({ where: { tenantId, publicId } });
  }

  public findProfessionals(tenantId: bigint, publicIds: string[]) {
    return this.client.professional.findMany({ where: { tenantId, publicId: { in: publicIds } } });
  }

  public findUnit(tenantId: bigint, publicId: string) {
    return this.client.businessUnit.findFirst({ where: { tenantId, publicId } });
  }

  public list(
    tenantId: bigint,
    professionalId: bigint,
    where: Prisma.ProfessionalUnavailabilityWhereInput,
  ) {
    return this.client.professionalUnavailability.findMany({
      where: { tenantId, professionalId, ...where },
      include: {
        professional: { select: { publicId: true } },
        unit: { select: { publicId: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  public find(tenantId: bigint, professionalId: bigint, publicId: string) {
    return this.client.professionalUnavailability.findFirst({
      where: { tenantId, professionalId, publicId },
      include: {
        professional: { select: { publicId: true } },
        unit: { select: { publicId: true } },
      },
    });
  }

  public create(data: Prisma.ProfessionalUnavailabilityUncheckedCreateInput) {
    return this.client.professionalUnavailability.create({ data });
  }

  public update(publicId: string, data: Prisma.ProfessionalUnavailabilityUncheckedUpdateInput) {
    return this.client.professionalUnavailability.update({ where: { publicId }, data });
  }

  public delete(publicId: string) {
    return this.client.professionalUnavailability.delete({ where: { publicId } });
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
