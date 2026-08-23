import { randomUUID } from 'node:crypto';

import { NotificationListResponseSchema, type NotificationListQuery } from '@plataforma/shared';

import { type EmailDelivery } from './email-delivery.js';
import { PushSubscriptionGoneError, type PushDelivery } from './push-delivery.js';
import { Prisma, type NotificationLog, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import {
  IntegrationUnavailableError,
  type WhatsAppDelivery,
  type WebhookDelivery,
} from '../integrations/integration-delivery.js';

export interface NotificationInput {
  channel?: 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'WEBHOOK';
  kind: string;
  targetType: string;
  targetPublicId: string | null;
  recipient: string;
  subject: string;
  body: string;
  email?: { html: string; fromName: string } | undefined;
  whatsappButtons?: Array<{ actionKey: string; label: string; enabled: boolean; order: number }> | undefined;
}

const EMAIL_ENVELOPE_PREFIX = '__AG_EMAIL_V1__';

function encodeEmailBody(input: NotificationInput): string {
  if (input.channel !== 'EMAIL' || input.email === undefined) return input.body;
  return `${EMAIL_ENVELOPE_PREFIX}${JSON.stringify({
    text: input.body,
    html: input.email.html,
    fromName: input.email.fromName,
  })}`;
}

function decodeEmailBody(body: string): { text: string; html?: string; fromName?: string } {
  if (!body.startsWith(EMAIL_ENVELOPE_PREFIX)) return { text: body };
  try {
    const value = JSON.parse(body.slice(EMAIL_ENVELOPE_PREFIX.length)) as {
      text?: unknown;
      html?: unknown;
      fromName?: unknown;
    };
    if (typeof value.text !== 'string') return { text: body };
    return {
      text: value.text,
      ...(typeof value.html === 'string' ? { html: value.html } : {}),
      ...(typeof value.fromName === 'string' ? { fromName: value.fromName } : {}),
    };
  } catch {
    return { text: body };
  }
}

export interface NotificationDeliveries {
  email: EmailDelivery;
  push: PushDelivery;
  whatsapp?: WhatsAppDelivery;
  webhook?: WebhookDelivery;
}

/** Ícone real versionado no frontend, usado quando o tenant não tem APP_ICON. */
const FALLBACK_PUSH_ICON = '/icons/agendei-192.png';

const MAX_AUTOMATIC_ATTEMPTS = 5;
const BACKOFF_MINUTES_PER_ATTEMPT = 2;
export const PROCESSING_LEASE_MINUTES = 10;

const MAX_NOTIFICATIONS_PER_TENANT_PER_BATCH = 2;
const MAX_GLOBAL_BATCH_SIZE = 20;
const MAX_CONCURRENT_DELIVERIES = 5;
const MAX_CONCURRENT_PER_TENANT = 1;

const pub = (item: NotificationLog) => ({
  publicId: item.publicId,
  channel: item.channel,
  kind: item.kind,
  targetType: item.targetType,
  targetPublicId: item.targetPublicId,
  recipient: item.recipient,
  subject: item.subject,
  status: item.status,
  attempts: item.attempts,
  lastError: item.lastError,
  sentAt: item.sentAt?.toISOString() ?? null,
  createdAt: item.createdAt.toISOString(),
});

export class NotificationService {
  private readonly enqueueing = new Set<string>();

  public constructor(
    private readonly client: PrismaClient,
    private readonly deliveries: NotificationDeliveries,
  ) {}

  /**
   * Enfileira uma notificação (grava o registro PENDING). Não tenta o envio
   * de forma síncrona — o envio acontece em processPending(), fora do
   * caminho da requisição. Idempotente por (tenant, kind, targetType,
   * targetPublicId, channel, recipient): uma segunda tentativa de
   * enfileirar o mesmo evento para o mesmo canal/destinatário é ignorada
   * silenciosamente — o campo recipient (endereço de e-mail, ou o publicId
   * da inscrição push) é o que permite múltiplos dispositivos push por
   * cliente sem colidir na constraint.
   */
  public async enqueue(tenantId: bigint, input: NotificationInput, scheduledAt?: Date): Promise<void> {
    const channel = input.channel ?? 'EMAIL';
    const identity = [
      tenantId.toString(),
      input.kind,
      input.targetType,
      input.targetPublicId ?? '',
      channel,
      input.recipient,
    ].join('\u0000');
    if (this.enqueueing.has(identity)) return;
    this.enqueueing.add(identity);
    try {
      const existing = await this.client.notificationLog.findFirst({
        where: {
          tenantId,
          kind: input.kind,
          targetType: input.targetType,
          targetPublicId: input.targetPublicId,
          channel,
          recipient: input.recipient,
        },
        select: { id: true },
      });
      if (existing !== null) return;
      const created = await this.client.notificationLog.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          channel,
          kind: input.kind,
          targetType: input.targetType,
          targetPublicId: input.targetPublicId,
          recipient: input.recipient,
          subject: input.subject,
          body: encodeEmailBody(input),
          status: 'PENDING',
          ...(scheduledAt !== undefined && { scheduledAt }),
          ...(input.whatsappButtons !== undefined && input.channel === 'WHATSAPP' ? { whatsappButtons: (input.whatsappButtons as any) } : {}),
        },
      });
      if (input.channel !== 'WEBHOOK')
        await this.enqueueWebhooks(tenantId, created.publicId, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    } finally {
      this.enqueueing.delete(identity);
    }
  }

  public async retry(tenantId: bigint, publicId: string): Promise<void> {
    const log = await this.client.notificationLog.findFirst({ where: { tenantId, publicId } });
    if (log === null)
      throw new AppError({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notificação não encontrada.',
        statusCode: 404,
      });
    if (log.status === 'SENT')
      throw new AppError({
        code: 'NOTIFICATION_ALREADY_SENT',
        message: 'A notificação já foi entregue.',
        statusCode: 409,
      });
    const claimed = await this.claim(log.id, log.status);
    if (claimed) await this.attempt(log.id);
  }

  public async list(tenantId: bigint, query: NotificationListQuery) {
    const where = {
      tenantId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.kind === undefined ? {} : { kind: query.kind }),
    };
    const [total, items] = await this.client.$transaction([
      this.client.notificationLog.count({ where }),
      this.client.notificationLog.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return NotificationListResponseSchema.parse({
      items: items.map(pub),
      page: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  }

  /**
   * Processa a fila com fairness multi-tenant e concorrência controlada.
   * Busca no máximo N notificações por tenant para evitar que um tenant
   * monopolize o batch. Limita entregas simultâneas a M.
   */
  public async processPending(batchSize = MAX_GLOBAL_BATCH_SIZE, now = new Date()): Promise<{ processed: number }> {
    const backoffThreshold = new Date(now.getTime() - BACKOFF_MINUTES_PER_ATTEMPT * 60_000);
    const processingLeaseThreshold = new Date(now.getTime() - PROCESSING_LEASE_MINUTES * 60_000);

    const allCandidates = await this.client.notificationLog.findMany({
      where: {
        AND: [
          {
            OR: [
              { status: 'PENDING' },
              {
                status: 'FAILED',
                attempts: { lt: MAX_AUTOMATIC_ATTEMPTS },
                updatedAt: { lte: backoffThreshold },
              },
              { status: 'PROCESSING', updatedAt: { lte: processingLeaseThreshold } },
            ],
          },
          {
            OR: [
              { scheduledAt: null },
              { scheduledAt: { lte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, tenantId: true },
    });

    const tenantMap = new Map<bigint, Array<{ id: bigint; status: NotificationLog['status']; tenantId: bigint }>>();
    for (const candidate of allCandidates) {
      if (!tenantMap.has(candidate.tenantId)) {
        tenantMap.set(candidate.tenantId, []);
      }
      const list = tenantMap.get(candidate.tenantId)!;
      if (list.length < MAX_NOTIFICATIONS_PER_TENANT_PER_BATCH) {
        list.push({ id: candidate.id, status: candidate.status, tenantId: candidate.tenantId });
      }
    }

    const candidates: Array<{ id: bigint; status: NotificationLog['status']; tenantId: bigint }> = [];
    for (const list of tenantMap.values()) {
      candidates.push(...list);
      if (candidates.length >= batchSize) break;
    }

    let processed = 0;
    const inFlight = new Set<Promise<void>>();
    const tenantInFlight = new Map<bigint, number>();

    for (const candidate of candidates) {
      const claimed = await this.claim(candidate.id, candidate.status);
      if (!claimed) continue;

      const tenantId = candidate.tenantId;
      const tenantCount = tenantInFlight.get(tenantId) ?? 0;

      if (tenantCount >= MAX_CONCURRENT_PER_TENANT) continue;

      tenantInFlight.set(tenantId, tenantCount + 1);

      const attemptPromise = this.attempt(candidate.id)
        .then(
          () => {
            processed += 1;
          },
          () => {},
        )
        .finally(() => {
          inFlight.delete(attemptPromise);
          const current = tenantInFlight.get(tenantId) ?? 1;
          tenantInFlight.set(tenantId, current - 1);
        });

      inFlight.add(attemptPromise);

      if (inFlight.size >= MAX_CONCURRENT_DELIVERIES) {
        await Promise.race(inFlight);
      }
    }

    await Promise.all(inFlight);
    return { processed };
  }

  /** Marca a linha como PROCESSING somente se ainda estiver no status esperado (claim atômico). */
  private async claim(id: bigint, expectedStatus: NotificationLog['status']): Promise<boolean> {
    const result = await this.client.notificationLog.updateMany({
      where: { id, status: expectedStatus },
      data: { status: 'PROCESSING' },
    });
    return result.count === 1;
  }

  private async attempt(id: bigint): Promise<void> {
    const log = await this.client.notificationLog.findUniqueOrThrow({ where: { id } });
    const delivery =
      log.channel === 'PUSH'
        ? this.deliveries.push
        : log.channel === 'EMAIL'
          ? this.deliveries.email
          : null;

    if (delivery !== null && !delivery.available) {
      await this.client.notificationLog.update({
        where: { id },
        data: {
          status: 'SKIPPED',
          attempts: { increment: 1 },
          lastError:
            log.channel === 'PUSH'
              ? 'VAPID não configurado para este ambiente.'
              : 'SMTP não configurado para este ambiente.',
        },
      });
      return;
    }

    try {
      if (log.channel === 'PUSH') {
        await this.attemptPush(log);
      } else if (log.channel === 'WHATSAPP') {
        if (this.deliveries.whatsapp === undefined)
          throw new IntegrationUnavailableError('WhatsApp não configurado.');
        const buttons = log.whatsappButtons as unknown as Array<{ actionKey: string; label: string; enabled: boolean }> | null;
        const hasButtons = buttons !== null && buttons.length > 0;
        if (hasButtons && buttons.some((b) => b.enabled)) {
          const actionKeyToButtonId = {
            CONFIRM_APPOINTMENT: 'BOOKING_CONFIRM',
            RESCHEDULE_APPOINTMENT: 'BOOKING_RESCHEDULE',
            CANCEL_APPOINTMENT: 'BOOKING_CANCEL',
          } as Record<string, string>;
          const enabledButtons = buttons.filter((b) => b.enabled);
          const mappedButtons = enabledButtons.map((b) => ({
            buttonId: actionKeyToButtonId[b.actionKey as keyof typeof actionKeyToButtonId] || b.actionKey,
            label: b.label,
          }));
          const result = await this.deliveries.whatsapp.sendInteractiveButtons(
            log.tenantId,
            log.recipient,
            log.body,
            mappedButtons,
          );
          const config = await this.client.tenantWhatsAppConfig.findUnique({
            where: { tenantId: log.tenantId },
            select: { phoneNumberId: true },
          });
          await this.client.whatsAppOutboundMessage.create({
            data: {
              publicId: randomUUID(),
              tenantId: log.tenantId,
              instanceId: config?.phoneNumberId ?? '',
              phone: log.recipient,
              externalMessageId: result.externalMessageId,
              actionIds: mappedButtons.map((b) => b.buttonId),
              status: result.status,
              notificationLogId: log.id,
              errorCode: result.errorCode,
            },
          });
        } else {
          await this.deliveries.whatsapp.send(log.tenantId, log.recipient, log.body);
        }
      } else if (log.channel === 'WEBHOOK') {
        if (this.deliveries.webhook === undefined)
          throw new IntegrationUnavailableError('Webhook não configurado.');
        await this.deliveries.webhook.send(log.tenantId, log.recipient, log.body, log.publicId);
      } else {
        const message = decodeEmailBody(log.body);
        await this.deliveries.email.send({
          to: log.recipient,
          subject: log.subject,
          text: message.text,
          ...(message.html === undefined ? {} : { html: message.html }),
          ...(message.fromName === undefined ? {} : { fromName: message.fromName }),
        });
      }
      await this.client.notificationLog.update({
        where: { id },
        data: { status: 'SENT', attempts: { increment: 1 }, lastError: null, sentAt: new Date() },
      });
    } catch (error) {
      await this.client.notificationLog.update({
        where: { id },
        data: {
          status: error instanceof IntegrationUnavailableError ? 'SKIPPED' : 'FAILED',
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Erro desconhecido.',
        },
      });
    }
  }

  private async enqueueWebhooks(
    tenantId: bigint,
    sourcePublicId: string,
    input: NotificationInput,
  ): Promise<void> {
    const integrations = await this.client.externalIntegration.findMany({
      where: { tenantId, active: true },
      select: { publicId: true, events: true },
    });
    for (const integration of integrations) {
      if (!Array.isArray(integration.events) || !integration.events.includes('notification.queued'))
        continue;
      await this.enqueue(tenantId, {
        channel: 'WEBHOOK',
        kind: 'integration.notification.queued',
        targetType: 'notification',
        targetPublicId: sourcePublicId,
        recipient: integration.publicId,
        subject: 'notification.queued',
        body: JSON.stringify({
          event: 'notification.queued',
          notificationPublicId: sourcePublicId,
          kind: input.kind,
          targetType: input.targetType,
          targetPublicId: input.targetPublicId,
        }),
      });
    }
  }

  /**
   * Ícone e destino da notificação vêm do backend, que sabe qual tenant a
   * originou — o service worker nunca precisa descobrir isso. Sem APP_ICON
   * publicável, cai no ícone global real do Agendei.
   */
  private async pushBranding(tenantId: bigint): Promise<{ icon: string; url: string }> {
    const tenant = await this.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        slug: true,
        mediaAssets: {
          where: { kind: 'APP_ICON', deletedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (tenant === null) return { icon: FALLBACK_PUSH_ICON, url: '/' };
    return {
      icon:
        tenant.mediaAssets.length > 0
          ? `/public/sites/${tenant.slug}/app-icon-192.png`
          : FALLBACK_PUSH_ICON,
      url: `/public/${tenant.slug}`,
    };
  }

  private async attemptPush(log: NotificationLog): Promise<void> {
    const subscription = await this.client.pushSubscription.findFirst({
      where: { publicId: log.recipient, active: true },
    });
    if (subscription === null) throw new Error('Inscrição push não encontrada ou inativa.');

    const branding = await this.pushBranding(log.tenantId);
    const payload = JSON.stringify({
      title: log.subject,
      body: log.body,
      icon: branding.icon,
      badge: branding.icon,
      url: branding.url,
    });
    try {
      await this.deliveries.push.send({
        subscription: {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        payload,
      });
      await this.client.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      if (error instanceof PushSubscriptionGoneError) {
        await this.client.pushSubscription.updateMany({
          where: { id: subscription.id, active: true },
          data: { active: false },
        });
      }
      throw error;
    }
  }
}
