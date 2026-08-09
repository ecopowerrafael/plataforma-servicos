import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class PrismaProfessionalScheduleRepository {
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

  public list(tenantId: bigint, professionalId: bigint) {
    return this.client.professionalWorkSchedule.findMany({
      where: { tenantId, professionalId },
      include: { unit: { select: { publicId: true } } },
      orderBy: [{ weekday: 'asc' }, { startsAt: 'asc' }],
    });
  }

  public findPeriod(tenantId: bigint, professionalId: bigint, publicId: string) {
    return this.client.professionalWorkSchedule.findFirst({
      where: { tenantId, professionalId, publicId },
      include: { unit: { select: { publicId: true } } },
    });
  }

  public create(data: Prisma.ProfessionalWorkScheduleUncheckedCreateInput) {
    return this.client.professionalWorkSchedule.create({ data });
  }

  public update(publicId: string, data: Prisma.ProfessionalWorkScheduleUncheckedUpdateInput) {
    return this.client.professionalWorkSchedule.update({ where: { publicId }, data });
  }

  public delete(publicId: string) {
    return this.client.professionalWorkSchedule.delete({ where: { publicId } });
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
