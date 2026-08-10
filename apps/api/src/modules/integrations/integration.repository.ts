import { randomUUID } from 'node:crypto';

import { type Prisma, type PrismaClient } from '../../database-client/client.js';

export class IntegrationRepository {
  public constructor(public readonly client: PrismaClient) {}
  public whatsapp(tenantId: bigint) {
    return this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId } });
  }
  public upsertWhatsapp(
    tenantId: bigint,
    data: {
      active: boolean;
      phoneNumberId: string;
      businessAccountId: string;
      encryptedAccessToken: string;
      apiVersion: string;
    },
  ) {
    return this.client.tenantWhatsAppConfig.upsert({
      where: { tenantId },
      create: { publicId: randomUUID(), tenantId, ...data },
      update: data,
    });
  }
  public integrations(tenantId: bigint) {
    return this.client.externalIntegration.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }
  public integration(tenantId: bigint, publicId: string) {
    return this.client.externalIntegration.findFirst({ where: { tenantId, publicId } });
  }
  public upsertIntegration(
    tenantId: bigint,
    publicId: string | null,
    data: {
      name: string;
      endpoint: string;
      encryptedSecret: string | null;
      events: Prisma.InputJsonValue;
      active: boolean;
    },
  ) {
    return publicId === null
      ? this.client.externalIntegration.create({
          data: { publicId: randomUUID(), tenantId, ...data },
        })
      : this.client.externalIntegration.update({ where: { publicId }, data });
  }
  public removeIntegration(id: bigint) {
    return this.client.externalIntegration.delete({ where: { id } });
  }
  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
