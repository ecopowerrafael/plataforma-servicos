import { randomUUID } from 'node:crypto';
import { NotificationCampaignListResponseSchema, NotificationCampaignSummarySchema, type CreateNotificationCampaignRequestSchema } from '@plataforma/shared';
import { type z } from 'zod';
import { type NotificationService } from './notification.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

type Input = z.infer<typeof CreateNotificationCampaignRequestSchema>;
const WHATSAPP_CONFIRMATION_LIMIT = 50;
const CAMPAIGN_OPERATIONAL_LIMIT = 500;
export const CAMPAIGN_MATERIALIZATION_BATCH_SIZE = 25;
const RECIPIENT_PROCESSING_LEASE_MINUTES = 10;

export class NotificationCampaignService {
  public constructor(private readonly client: PrismaClient, private readonly notifications: NotificationService, private readonly entitlements: Pick<PlanEntitlementService, 'assertFeatureEnabledForTenant'> = new PlanEntitlementService()) {}

  public async create(tenantId: bigint, input: Input) {
    const existing = await this.client.notificationCampaign.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
    if (existing !== null) return this.summary(existing);
    if (input.recipientMode === 'ALL' && input.recipientPublicIds.length > 0) throw new AppError({ code: 'CAMPAIGN_RECIPIENTS_INVALID', message: 'A seleção não corresponde ao público informado.', statusCode: 400 });
    if (input.channel === 'WHATSAPP') await this.assertWhatsApp(tenantId);
    const people = await this.resolvePeople(tenantId, input);
    if (input.recipientMode === 'SELECTED' && people.length !== new Set(input.recipientPublicIds).size) throw new AppError({ code: 'CAMPAIGN_RECIPIENT_NOT_FOUND', message: 'Uma ou mais pessoas selecionadas não pertencem a este estabelecimento.', statusCode: 400 });
    if (people.length > CAMPAIGN_OPERATIONAL_LIMIT) throw new AppError({ code: 'CAMPAIGN_OPERATIONAL_LIMIT', message: `O limite operacional é de ${String(CAMPAIGN_OPERATIONAL_LIMIT)} destinatários por campanha.`, statusCode: 409 });
    if (input.channel === 'WHATSAPP' && people.length > WHATSAPP_CONFIRMATION_LIMIT && !input.whatsappRiskAcknowledged) throw new AppError({ code: 'WHATSAPP_RISK_ACKNOWLEDGEMENT_REQUIRED', message: 'Confirme que os contatos autorizaram o recebimento para continuar.', statusCode: 400 });
    // O create aninhado é uma única transação: nunca persistimos uma campanha
    // QUEUED sem o snapshot que o worker precisa para retomá-la.
    const campaign = await this.client.notificationCampaign.create({ data: {
      publicId: randomUUID(), tenantId, idempotencyKey: input.idempotencyKey, audience: input.audience,
      channel: input.channel, title: input.title ?? '', message: input.message, recipientCount: people.length,
      recipients: { createMany: { data: people.map((person) => ({ publicId: randomUUID(), targetPublicId: person.publicId })) } },
    } });
    return this.summary(campaign);
  }

  public async materializePending(batchSize = CAMPAIGN_MATERIALIZATION_BATCH_SIZE): Promise<{ processed: number }> {
    const campaign = await this.client.notificationCampaign.findFirst({ where: { status: { in: ['QUEUED', 'PROCESSING'] } }, orderBy: { createdAt: 'asc' } });
    if (campaign === null) return { processed: 0 };
    // O claim é por destinatário, não por campanha. Assim duas instâncias podem
    // observar a mesma campanha sem duplicar logs e a próxima rodada continua
    // imediatamente com o lote seguinte.
    await this.client.notificationCampaign.update({ where: { id: campaign.id }, data: { status: 'PROCESSING', startedAt: campaign.startedAt ?? new Date() } });
    const leaseThreshold = new Date(Date.now() - RECIPIENT_PROCESSING_LEASE_MINUTES * 60_000);
    const recipients = await this.client.notificationCampaignRecipient.findMany({ where: { campaignId: campaign.id, OR: [{ status: 'PENDING' }, { status: 'PROCESSING', updatedAt: { lte: leaseThreshold } }] }, orderBy: { id: 'asc' }, take: batchSize });
    for (const recipient of recipients) {
      const claimed = await this.client.notificationCampaignRecipient.updateMany({
        where: { id: recipient.id, status: recipient.status, updatedAt: recipient.updatedAt },
        data: { status: 'PROCESSING' },
      });
      if (claimed.count === 1) await this.materializeRecipient(campaign, recipient);
    }
    await this.completeIfDrained(campaign);
    return { processed: recipients.length };
  }

  public async reconcile(): Promise<void> {
    const campaigns = await this.client.notificationCampaign.findMany({ where: { status: 'PROCESSING' }, take: 30 });
    for (const campaign of campaigns) await this.completeIfDrained(campaign);
  }

  public async list(tenantId: bigint) {
    const campaigns = await this.client.notificationCampaign.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 30 });
    return NotificationCampaignListResponseSchema.parse({ items: await Promise.all(campaigns.map((campaign) => this.summary(campaign))) });
  }

  private async materializeRecipient(campaign: any, recipient: any): Promise<void> {
    const person = campaign.audience === 'CUSTOMERS'
      ? await this.client.customer.findFirst({ where: { tenantId: campaign.tenantId, publicId: recipient.targetPublicId }, select: { phone: true, whatsapp: true, acceptsCommunications: true, pushSubscriptions: { where: { active: true }, select: { publicId: true } } } })
      : await this.client.professional.findFirst({ where: { tenantId: campaign.tenantId, publicId: recipient.targetPublicId }, select: { phone: true } });
    let deliveries: string[] = [];
    if (person !== null && (campaign.audience !== 'CUSTOMERS' || person.acceptsCommunications !== false)) {
      if (campaign.channel === 'PUSH' && 'pushSubscriptions' in person) deliveries = person.pushSubscriptions.map((subscription) => subscription.publicId);
      if (campaign.channel === 'WHATSAPP') { const raw = 'whatsapp' in person ? (person.whatsapp ?? person.phone) : person.phone; const phone = raw === null ? null : normalizeWhatsAppPhone(raw); if (phone !== null) deliveries = [phone]; }
    }
    for (const delivery of deliveries) await this.notifications.enqueue(campaign.tenantId, { channel: campaign.channel, kind: 'marketing.campaign', targetType: 'campaign-recipient', targetPublicId: recipient.publicId, recipient: delivery, subject: campaign.title, body: campaign.message });
    await this.client.notificationCampaignRecipient.update({ where: { id: recipient.id }, data: { status: deliveries.length === 0 ? 'SKIPPED' : 'MATERIALIZED' } });
    await this.client.notificationCampaign.update({ where: { id: campaign.id }, data: deliveries.length === 0 ? { skippedCount: { increment: 1 }, materializedCount: { increment: 1 } } : { eligibleCount: { increment: 1 }, deliveryCount: { increment: deliveries.length }, materializedCount: { increment: 1 } } });
  }

  private async completeIfDrained(campaign: any): Promise<void> {
    const pending = await this.client.notificationCampaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ['PENDING', 'PROCESSING'] } } });
    if (pending !== 0) return;
    const ids = (await this.client.notificationCampaignRecipient.findMany({ where: { campaignId: campaign.id }, select: { publicId: true } })).map((item) => item.publicId);
    const activeLogs = await this.client.notificationLog.count({ where: { tenantId: campaign.tenantId, targetType: 'campaign-recipient', targetPublicId: { in: ids }, status: { in: ['PENDING', 'PROCESSING'] } } });
    if (activeLogs === 0) await this.client.notificationCampaign.update({ where: { id: campaign.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  }

  private async resolvePeople(tenantId: bigint, input: Input): Promise<{ publicId: string }[]> {
    const where = input.audience === 'CUSTOMERS' ? { tenantId, status: 'ACTIVE' as const, ...(input.recipientMode === 'SELECTED' ? { publicId: { in: input.recipientPublicIds } } : {}) } : { tenantId, active: true, ...(input.recipientMode === 'SELECTED' ? { publicId: { in: input.recipientPublicIds } } : {}) };
    return input.audience === 'CUSTOMERS' ? this.client.customer.findMany({ where, select: { publicId: true } }) : this.client.professional.findMany({ where, select: { publicId: true } });
  }

  private async assertWhatsApp(tenantId: bigint): Promise<void> {
    await this.entitlements.assertFeatureEnabledForTenant(this.client, tenantId, 'whatsapp.enabled');
    const config = await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId }, select: { active: true } });
    if (config?.active !== true) throw new AppError({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'Configure o WhatsApp em Integrações antes de enviar.', statusCode: 409 });
  }

  private async summary(campaign: any) {
    const ids = (await this.client.notificationCampaignRecipient.findMany({ where: { campaignId: campaign.id }, select: { publicId: true } })).map((item) => item.publicId);
    const grouped = await this.client.notificationLog.groupBy({ by: ['status'], where: { tenantId: campaign.tenantId, targetType: 'campaign-recipient', targetPublicId: { in: ids } }, _count: { _all: true } });
    const count = (status: string) => grouped.find((item: any) => item.status === status)?._count._all ?? 0;
    return NotificationCampaignSummarySchema.parse({ publicId: campaign.publicId, audience: campaign.audience, channel: campaign.channel, title: campaign.title, message: campaign.message, status: campaign.status, recipientCount: campaign.recipientCount, eligibleCount: campaign.eligibleCount, skippedCount: campaign.skippedCount, deliveryCount: campaign.deliveryCount, queued: count('PENDING') + count('PROCESSING'), sent: count('SENT'), failed: count('FAILED'), skipped: campaign.skippedCount, createdAt: campaign.createdAt.toISOString() });
  }
}
