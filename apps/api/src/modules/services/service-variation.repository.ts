import { type Prisma, type PrismaClient } from '../../database-client/client.js';
export class PrismaServiceVariationRepository {
  public constructor(private readonly client: PrismaClient) {}
  public findService(tenantId: bigint, publicId: string) {
    return this.client.service.findFirst({ where: { tenantId, publicId } });
  }
  public list(tenantId: bigint, serviceId: bigint) {
    return this.client.serviceVariation.findMany({
      where: { tenantId, serviceId },
      include: { service: { select: { publicId: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
  public find(tenantId: bigint, serviceId: bigint, publicId: string) {
    return this.client.serviceVariation.findFirst({
      where: { tenantId, serviceId, publicId },
      include: { service: { select: { publicId: true } } },
    });
  }
  public create(data: Prisma.ServiceVariationUncheckedCreateInput) {
    return this.client.serviceVariation.create({
      data,
      include: { service: { select: { publicId: true } } },
    });
  }
  public update(id: bigint, data: Prisma.ServiceVariationUncheckedUpdateInput) {
    return this.client.serviceVariation.update({
      where: { id },
      data,
      include: { service: { select: { publicId: true } } },
    });
  }
  public delete(id: bigint) {
    return this.client.serviceVariation.delete({ where: { id } });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
