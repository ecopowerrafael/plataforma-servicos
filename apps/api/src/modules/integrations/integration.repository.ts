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
      instanceName?: string | undefined;
      phoneNumber?: string | undefined;
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
      ...(data.instanceName === undefined ? {} : { instanceName: data.instanceName }),
      ...(data.phoneNumber === undefined ? {} : { connectedPhone: data.phoneNumber }),
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
    text: string | null;
    referencedMessageId: string | null;
    customerId: bigint | null;
    payload: Prisma.InputJsonValue;
  }) {
    return this.client.whatsAppInboundEvent.create({ data: { publicId: randomUUID(), ...data } });
  }
  public inboundEventByFingerprint(tenantId: bigint, fingerprint: string) {
    return this.client.whatsAppInboundEvent.findFirst({ where: { tenantId, fingerprint } });
  }
  public createOutboundMessage(data: {
    tenantId: bigint;
    instanceId: string;
    phone: string;
    externalMessageId: string | null;
    actionIds: Prisma.InputJsonValue;
    status: string;
    customerId?: bigint | null;
    notificationLogId?: bigint | null;
    errorCode?: string | null;
  }) {
    return this.client.whatsAppOutboundMessage.create({
      data: { publicId: randomUUID(), ...data },
    });
  }
  /** O tenant faz parte da chave: uma instância nunca alcança mensagem de outro. */
  public outboundByExternalMessageId(tenantId: bigint, externalMessageId: string) {
    return this.client.whatsAppOutboundMessage.findFirst({
      where: { tenantId, externalMessageId },
      orderBy: { sentAt: 'desc' },
      include: { notification: { select: { targetType: true, targetPublicId: true } } },
    });
  }
  public updateOutboundStatus(
    id: bigint,
    data: {
      status: string;
      errorCode?: string | null;
      sentAt?: Date;
      deliveredAt?: Date;
      readAt?: Date;
      failedAt?: Date;
    },
  ) {
    return this.client.whatsAppOutboundMessage.update({ where: { id }, data });
  }
  public lastOutboundMessage(tenantId: bigint) {
    return this.client.whatsAppOutboundMessage.findFirst({
      where: { tenantId },
      orderBy: { sentAt: 'desc' },
    });
  }
  /** Conversa mais recente do par tenant + telefone. Nunca busca só por telefone. */
  public conversationFor(tenantId: bigint, phone: string) {
    return this.client.whatsAppConversation.findFirst({
      where: { tenantId, phone },
      orderBy: { lastInboundAt: 'desc' },
    });
  }
  public createConversation(data: {
    tenantId: bigint;
    customerId: bigint | null;
    phone: string;
    lastInboundAt: Date;
    expiresAt: Date;
  }) {
    return this.client.whatsAppConversation.create({
      data: { publicId: randomUUID(), status: 'ACTIVE', currentFlow: 'MAIN_MENU', ...data },
    });
  }
  public updateConversation(
    id: bigint,
    data: {
      status?: string;
      currentFlow?: string;
      currentStep?: string | null;
      context?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
      customerId?: bigint | null;
      lastInboundAt?: Date;
      lastOutboundAt?: Date;
      expiresAt?: Date;
    },
  ) {
    return this.client.whatsAppConversation.update({ where: { id }, data });
  }
  public closeConversation(id: bigint) {
    return this.client.whatsAppConversation.update({ where: { id }, data: { status: 'CLOSED' } });
  }
  public lastConversation(tenantId: bigint) {
    return this.client.whatsAppConversation.findFirst({
      where: { tenantId },
      orderBy: { lastInboundAt: 'desc' },
    });
  }
  /** Cliente do tenant pelo telefone já normalizado, testando as duas colunas. */
  public tenantName(tenantId: bigint) {
    return this.client.tenant.findUnique({
      where: { id: tenantId },
      select: { displayName: true, timezone: true, currency: true },
    });
  }
  public tenantSlug(tenantId: bigint) {
    return this.client.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  }
  public customerName(customerId: bigint) {
    return this.client.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  }
  public customerByPhone(tenantId: bigint, candidates: string[]) {
    return this.client.customer.findFirst({
      where: {
        tenantId,
        OR: [{ phone: { in: candidates } }, { whatsapp: { in: candidates } }],
      },
      select: { id: true },
    });
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
