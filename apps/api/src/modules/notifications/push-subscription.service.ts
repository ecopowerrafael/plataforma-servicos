import { createHash, randomUUID } from 'node:crypto';

import { PushSubscriptionListResponseSchema, type SubscribePushRequest } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

const hashEndpoint = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

export class PushSubscriptionService {
  public constructor(private readonly client: PrismaClient) {}

  /**
   * Cria a inscrição, ou — se o mesmo endpoint (mesmo navegador/dispositivo)
   * já existir — reassocia ao tenant/cliente autenticado atual e reativa.
   * O endpoint em si é a identidade natural do dispositivo, então dois
   * clientes nunca compartilham a mesma linha simultaneamente: a
   * reassociação sempre reflete quem está autenticado agora.
   */
  public async subscribe(tenantId: bigint, customerId: bigint, input: SubscribePushRequest) {
    const endpointHash = hashEndpoint(input.endpoint);
    const existing = await this.client.pushSubscription.findUnique({ where: { endpointHash } });
    if (existing === null) {
      const created = await this.client.pushSubscription.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          customerId,
          endpoint: input.endpoint,
          endpointHash,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
          active: true,
        },
      });
      return { publicId: created.publicId };
    }
    const updated = await this.client.pushSubscription.update({
      where: { id: existing.id },
      data: {
        tenantId,
        customerId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        active: true,
      },
    });
    return { publicId: updated.publicId };
  }

  public async unsubscribe(tenantId: bigint, customerId: bigint, endpoint: string) {
    const endpointHash = hashEndpoint(endpoint);
    const subscription = await this.client.pushSubscription.findFirst({
      where: { tenantId, customerId, endpointHash },
      select: { id: true },
    });
    if (subscription === null)
      throw new AppError({
        code: 'PUSH_SUBSCRIPTION_NOT_FOUND',
        message: 'Inscrição de notificações push não encontrada.',
        statusCode: 404,
      });
    await this.client.pushSubscription.delete({ where: { id: subscription.id } });
    return { success: true as const };
  }

  public async list(tenantId: bigint, customerId: bigint) {
    const items = await this.client.pushSubscription.findMany({
      where: { tenantId, customerId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    return PushSubscriptionListResponseSchema.parse({
      items: items.map((item) => ({
        publicId: item.publicId,
        userAgent: item.userAgent,
        createdAt: item.createdAt.toISOString(),
        lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
      })),
    });
  }
}
