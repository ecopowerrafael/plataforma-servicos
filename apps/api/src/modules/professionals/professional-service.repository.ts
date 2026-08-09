import { type Prisma, type PrismaClient } from '../../database-client/client.js';
export class PrismaProfessionalServiceRepository {
  public constructor(private readonly client: PrismaClient) {}
  public findProfessional(tenantId: bigint, id: string) {
    return this.client.professional.findFirst({ where: { tenantId, publicId: id } });
  }
  public findService(tenantId: bigint, id: string) {
    return this.client.service.findFirst({ where: { tenantId, publicId: id } });
  }
  public listByProfessional(tenantId: bigint, id: string) {
    return this.client.professionalService.findMany({
      where: { tenantId, professional: { publicId: id } },
      include: { professional: true, service: true },
    });
  }
  public listByService(tenantId: bigint, id: string) {
    return this.client.professionalService.findMany({
      where: { tenantId, service: { publicId: id } },
      include: { professional: true, service: true },
    });
  }
  public find(tenantId: bigint, professionalId: bigint, serviceId: bigint) {
    return this.client.professionalService.findFirst({
      where: { tenantId, professionalId, serviceId },
      include: { professional: true, service: true },
    });
  }
  public upsert(data: Prisma.ProfessionalServiceUncheckedCreateInput) {
    return this.client.professionalService.upsert({
      where: {
        professionalId_serviceId: {
          professionalId: data.professionalId,
          serviceId: data.serviceId,
        },
      },
      create: data,
      update: data,
      include: { professional: true, service: true },
    });
  }
  public update(id: bigint, data: Prisma.ProfessionalServiceUncheckedUpdateInput) {
    return this.client.professionalService.update({ where: { id }, data });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
