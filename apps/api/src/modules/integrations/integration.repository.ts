import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { type WhatsAppProviderId } from './whatsapp-provider.js';
import { resolveWhatsAppOwner, type WhatsAppOwnerResolution } from './whatsapp-owner.js';

export class IntegrationRepository {
  public constructor(public readonly client: PrismaClient) {}

  public whatsappSettings(tenantId: bigint) {
    return this.client.tenantWhatsAppSettings.findUnique({ where: { tenantId } });
  }

  public async selectedWhatsappProvider(tenantId: bigint): Promise<WhatsAppProviderId> {
    const settings = await this.whatsappSettings(tenantId);
    if (settings !== null) return settings.selectedProvider;
    const legacy = await this.client.tenantWhatsAppConfig.findFirst({
      where: { tenantId },
      select: { provider: true },
      orderBy: { id: 'asc' },
    });
    return legacy?.provider ?? 'WAPI';
  }

  public async ensureWhatsappSettings(tenantId: bigint, data: { selectedProvider?: string; assistantConfig?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput } = {}) {
    const legacy = await this.client.tenantWhatsAppConfig.findFirst({
      where: { tenantId },
      select: { provider: true, assistantConfig: true },
      orderBy: { id: 'asc' },
    });
    return this.client.tenantWhatsAppSettings.upsert({
      where: { tenantId },
      create: {
        publicId: randomUUID(),
        tenantId,
        selectedProvider: data.selectedProvider ?? legacy?.provider ?? 'WAPI',
        assistantConfig: data.assistantConfig ?? legacy?.assistantConfig ?? Prisma.DbNull,
      },
      update: data,
    });
  }

  public whatsappProviderConfig(tenantId: bigint, provider: WhatsAppProviderId) {
    return this.client.tenantWhatsAppConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
  }

  public activeWhatsappProviderConfig(tenantId: bigint) {
    return this.selectedWhatsappProvider(tenantId).then((provider) =>
      this.whatsappProviderConfig(tenantId, provider),
    );
  }

  public async whatsappAssistantConfig(tenantId: bigint) {
    const settings = await this.whatsappSettings(tenantId);
    if (settings !== null) return settings.assistantConfig;
    const legacy = await this.client.tenantWhatsAppConfig.findFirst({
      where: { tenantId },
      select: { assistantConfig: true },
      orderBy: { id: 'asc' },
    });
    return legacy?.assistantConfig;
  }

  public whatsapp(tenantId: bigint) {
    return this.activeWhatsappProviderConfig(tenantId);
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
      where: { tenantId_provider: { tenantId, provider: 'WAPI' } },
      create: { publicId: randomUUID(), tenantId, provider: 'WAPI', ...stored },
      update: stored,
    });
  }
  public updateWhatsappValidation(tenantId: bigint, status: string, at: Date) {
    return this.client.tenantWhatsAppConfig.update({
      where: { tenantId_provider: { tenantId, provider: 'WAPI' } },
      data: { lastValidationStatus: status, lastValidatedAt: at },
    });
  }
  /** Resolve o tenant a partir do instanceId recebido no webhook. */
  public whatsappByInstanceId(instanceId: string) {
    return this.client.tenantWhatsAppConfig.findFirst({
      where: { phoneNumberId: instanceId, provider: 'WAPI' },
      orderBy: { id: 'asc' },
    });
  }

  public async resolveWhatsAppOwner(provider: WhatsAppProviderId, externalInstanceId: string): Promise<WhatsAppOwnerResolution> {
    const tenants = await this.client.tenantWhatsAppConfig.findMany({
      where: { provider, phoneNumberId: externalInstanceId },
      select: { tenantId: true, publicId: true },
    });
    const prospecting = provider === 'WAPI'
      ? await this.client.prospectingWhatsAppConfig.findFirst({
          where: { instanceId: externalInstanceId, isActive: true },
          select: { publicId: true },
        })
      : null;
    return resolveWhatsAppOwner({
      provider,
      externalInstanceId,
      tenant: tenants.length > 1 ? { ownerType: 'TENANT' } : tenants.length === 1 && tenants[0] !== undefined ? { ownerType: 'TENANT', tenantId: tenants[0].tenantId.toString(), integrationId: tenants[0].publicId } : null,
      prospecting: prospecting === null ? null : { ownerType: 'PROSPECTING', integrationId: prospecting.publicId },
    });
  }
  public metaWhatsappByWebhookPublicId(webhookPublicId: string) {
    return this.client.tenantWhatsAppConfig.findFirst({
      where: { provider: 'META', webhookPublicId },
    });
  }
  public evolutionWhatsappByWebhookPublicId(webhookPublicId: string) {
    return this.client.tenantWhatsAppConfig.findFirst({ where: { provider: 'EVOLUTION', webhookPublicId } });
  }
  public createInboundEvent(data: {
    tenantId: bigint;
    provider?: string;
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
    encryptedMediaDescriptor?: string | null;
    transcriptionStatus?: string;
  }) {
    return this.client.whatsAppInboundEvent.create({ data: { publicId: randomUUID(), provider: data.provider ?? 'WAPI', ...data } });
  }
  public inboundEventById(id: bigint) {
    return this.client.whatsAppInboundEvent.findUnique({ where: { id } });
  }
  public pendingInboundEvents(limit = 50, before: Date = new Date()) {
    return this.client.whatsAppInboundEvent.findMany({
      where: { processedAt: null, receivedAt: { lte: before } },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
  }
  public inboundEventsAfter(tenantId: bigint, phone: string, after: Date | null) {
    return this.client.whatsAppInboundEvent.findMany({
      where: { tenantId, phone, eventType: { in: ['MESSAGE_RECEIVED', 'MESSAGE_ACTION'] }, ...(after === null ? {} : { receivedAt: { gt: after } }) },
      orderBy: { receivedAt: 'asc' },
    });
  }
  public inboundEventByFingerprint(tenantId: bigint, fingerprint: string, data?: { provider?: string; instanceId?: string; externalMessageId?: string | null; eventType?: string | null }) {
    if (data?.provider !== undefined && data.instanceId !== undefined && data.eventType !== undefined) {
      if (data.externalMessageId !== null && data.externalMessageId !== undefined) {
        return this.client.whatsAppInboundEvent.findFirst({ where: { tenantId, provider: data.provider, instanceId: data.instanceId, externalMessageId: data.externalMessageId, eventType: data.eventType } });
      }
      return this.client.whatsAppInboundEvent.findFirst({ where: { tenantId, provider: data.provider, instanceId: data.instanceId, eventType: data.eventType, fingerprint } });
    }
    return this.client.whatsAppInboundEvent.findFirst({ where: { tenantId, fingerprint } });
  }
  public claimInboundEvent(id: bigint, token: string, owner: string, now: Date, staleBefore: Date, allowPreviousOwner = false) {
    return this.client.whatsAppInboundEvent.updateMany({
      where: {
        id,
        processedAt: null,
        OR: [
          { processingStartedAt: null },
          { processingStartedAt: { lt: staleBefore } },
          ...(allowPreviousOwner ? [{ processingOwner: { not: owner } }] : []),
        ],
      },
      data: { processingStartedAt: now, processingToken: token, processingOwner: owner, processingAttempts: { increment: 1 } },
    });
  }
  public completeInboundEvent(id: bigint, token: string, processedAt: Date) {
    return this.client.whatsAppInboundEvent.updateMany({
      where: { id, processingToken: token, processedAt: null },
      data: { processedAt, processingStartedAt: null, processingToken: null, processingOwner: null },
    });
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
      pendingReplyAt?: Date | null;
      pendingReplyEventId?: bigint | null;
      replyProcessingAt?: Date | null;
      replyProcessingToken?: string | null;
      expiresAt?: Date;
    },
  ) {
    return this.client.whatsAppConversation.update({ where: { id }, data });
  }
  public async claimPendingReply(now: Date, token: string, staleBefore: Date) {
    const candidate = await this.client.whatsAppConversation.findFirst({
      where: {
        pendingReplyAt: { lte: now },
        OR: [{ replyProcessingAt: null }, { replyProcessingAt: { lt: staleBefore } }],
      },
      orderBy: { pendingReplyAt: 'asc' },
    });
    if (candidate === null || candidate.pendingReplyEventId === null) return null;
    const claimed = await this.client.whatsAppConversation.updateMany({
      where: {
        id: candidate.id,
        pendingReplyAt: candidate.pendingReplyAt,
        pendingReplyEventId: candidate.pendingReplyEventId,
        OR: [{ replyProcessingAt: null }, { replyProcessingAt: { lt: staleBefore } }],
      },
      data: { replyProcessingAt: now, replyProcessingToken: token },
    });
    return claimed.count === 1 ? candidate : null;
  }
  public completePendingReply(id: bigint, token: string) {
    return this.client.whatsAppConversation.updateMany({ where: { id, replyProcessingToken: token }, data: { pendingReplyAt: null, pendingReplyEventId: null, replyProcessingAt: null, replyProcessingToken: null } });
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
