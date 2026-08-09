import { type Prisma, type PrismaClient } from '../../database-client/client.js';

const include = {
  professional: { select: { publicId: true, publicName: true } },
  service: { select: { publicId: true, name: true } },
} as const;

export class CustomerFavoriteRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list(tenantId: bigint, customerId: bigint) {
    return this.client.customerFavorite.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  public find(tenantId: bigint, customerId: bigint, publicId: string) {
    return this.client.customerFavorite.findFirst({
      where: { tenantId, customerId, publicId },
    });
  }

  public findExisting(
    tenantId: bigint,
    customerId: bigint,
    professionalId: bigint | null,
    serviceId: bigint | null,
  ) {
    return this.client.customerFavorite.findFirst({
      where: { tenantId, customerId, professionalId, serviceId },
    });
  }

  public professional(tenantId: bigint, publicId: string) {
    return this.client.professional.findFirst({
      where: { tenantId, publicId, active: true },
    });
  }

  public service(tenantId: bigint, publicId: string) {
    return this.client.service.findFirst({ where: { tenantId, publicId, active: true } });
  }

  public create(data: Prisma.CustomerFavoriteUncheckedCreateInput) {
    return this.client.customerFavorite.create({ data, include });
  }

  public delete(id: bigint) {
    return this.client.customerFavorite.delete({ where: { id } });
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
