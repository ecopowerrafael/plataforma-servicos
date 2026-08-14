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
      instanceId: string;
      encryptedAccessToken: string;
    },
  ) {
    const stored = {
      active: data.active,
      phoneNumberId: data.instanceId,
      businessAccountId: 'internal',
      encryptedAccessToken: data.encryptedAccessToken,
      apiVersion: 'v1',
      lastValidationStatus: null,
      lastValidatedAt: null,
    };
    return this.client.tenantWhatsAppConfig.upsert({
      where: { tenantId },
      create: { publicId: randomUUID(), tenantId, ...stored },
      update: stored,
    });
  }
  public updateWhatsappValidation(tenantId: bigint, status: string, at: Date) {
    return this.client.tenantWhatsAppConfig.update({
      where: { tenantId },
      data: { lastValidationStatus: status, lastValidatedAt: at },
    });
  }
  /** Resolve o tenant a partir do instanceId recebido no webhook. */
  public whatsappByInstanceId(instanceId: string) {
    return this.client.tenantWhatsAppConfig.findFirst({ where: { phoneNumberId: instanceId } });
  }
  public createInboundEvent(data: {
    tenantId: bigint;
    instanceId: string;
    externalMessageId: string | null;
    phone: string | null;
    eventType: string | null;
    messageType: string | null;
    actionId: string | null;
    fingerprint: string;
    payload: Prisma.InputJsonValue;
  }) {
    return this.client.whatsAppInboundEvent.create({ data: { publicId: randomUUID(), ...data } });
  }
  public inboundEventByFingerprint(tenantId: bigint, fingerprint: string) {
    return this.client.whatsAppInboundEvent.findFirst({ where: { tenantId, fingerprint } });
  }
  public lastInboundEvent(tenantId: bigint) {
    return this.client.whatsAppInboundEvent.findFirst({
      where: { tenantId },
      orderBy: { receivedAt: 'desc' },
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
