import { randomUUID } from 'node:crypto';

import { NotificationListResponseSchema, type NotificationListQuery } from '@plataforma/shared';

import { type EmailDelivery } from './email-delivery.js';
import { PushSubscriptionGoneError, type PushDelivery } from './push-delivery.js';
import { Prisma, type NotificationLog, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

export interface NotificationInput {
  channel?: 'EMAIL' | 'PUSH';
  kind: string;
  targetType: string;
  targetPublicId: string | null;
  recipient: string;
  subject: string;
  body: string;
}

export interface NotificationDeliveries {
  email: EmailDelivery;
  push: PushDelivery;
}

const MAX_AUTOMATIC_ATTEMPTS = 5;
const BACKOFF_MINUTES_PER_ATTEMPT = 2;

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
  public async enqueue(tenantId: bigint, input: NotificationInput): Promise<void> {
    try {
      await this.client.notificationLog.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          channel: input.channel ?? 'EMAIL',
          kind: input.kind,
          targetType: input.targetType,
          targetPublicId: input.targetPublicId,
          recipient: input.recipient,
          subject: input.subject,
          body: input.body,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
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
   * Processa a fila: reivindica (claim atômico via UPDATE condicional,
   * impedindo duas execuções concorrentes de processarem a mesma linha) um
   * lote de notificações PENDING, mais as FAILED elegíveis para nova
   * tentativa automática (dentro do limite de tentativas e do backoff
   * mínimo desde a última tentativa), e tenta a entrega de cada uma.
   */
  public async processPending(batchSize = 20): Promise<{ processed: number }> {
    const backoffThreshold = new Date(Date.now() - BACKOFF_MINUTES_PER_ATTEMPT * 60_000);
    const candidates = await this.client.notificationLog.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          {
            status: 'FAILED',
            attempts: { lt: MAX_AUTOMATIC_ATTEMPTS },
            updatedAt: { lte: backoffThreshold },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
      select: { id: true, status: true },
    });

    let processed = 0;
    for (const candidate of candidates) {
      const claimed = await this.claim(candidate.id, candidate.status);
      if (!claimed) continue;
      await this.attempt(candidate.id);
      processed += 1;
    }
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
    const delivery = log.channel === 'PUSH' ? this.deliveries.push : this.deliveries.email;

    if (!delivery.available) {
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
      } else {
        await this.deliveries.email.send({
          to: log.recipient,
          subject: log.subject,
          text: log.body,
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
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Erro desconhecido.',
        },
      });
    }
  }

  private async attemptPush(log: NotificationLog): Promise<void> {
    const subscription = await this.client.pushSubscription.findFirst({
      where: { publicId: log.recipient, active: true },
    });
    if (subscription === null) throw new Error('Inscrição push não encontrada ou inativa.');

    const payload = JSON.stringify({ title: log.subject, body: log.body });
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
