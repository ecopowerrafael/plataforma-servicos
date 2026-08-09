import { type Prisma, type PrismaClient } from '../../database-client/client.js';

const include = {
  appointment: { select: { publicId: true, protocol: true } },
  professional: { select: { publicId: true, publicName: true } },
  service: { select: { publicId: true, name: true } },
} as const;

export class AppointmentReviewRepository {
  public constructor(private readonly client: PrismaClient) {}

  public list(tenantId: bigint, customerId: bigint) {
    return this.client.appointmentReview.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  public findByAppointment(tenantId: bigint, customerId: bigint, appointmentId: bigint) {
    return this.client.appointmentReview.findFirst({
      where: { tenantId, customerId, appointmentId },
      include,
    });
  }

  public find(tenantId: bigint, customerId: bigint, publicId: string) {
    return this.client.appointmentReview.findFirst({
      where: { tenantId, customerId, publicId },
      include,
    });
  }

  public create(data: Prisma.AppointmentReviewUncheckedCreateInput) {
    return this.client.appointmentReview.create({ data, include });
  }

  public update(id: bigint, data: Prisma.AppointmentReviewUncheckedUpdateInput) {
    return this.client.appointmentReview.update({ where: { id }, data, include });
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
