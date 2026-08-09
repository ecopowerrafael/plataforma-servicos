import { TenantSubscriptionResponseSchema } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { mapPlan, mapSubscription } from '../platform/platform.service.js';

export class TenantSubscriptionService {
  public constructor(private readonly client: PrismaClient) {}

  public async get(tenantId: bigint) {
    const subscription =
      (await this.client.tenantSubscription.findFirst({
        where: { tenantId, effectiveKey: 'EFFECTIVE' },
        include: { tenant: true, plan: true },
      })) ??
      (await this.client.tenantSubscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { tenant: true, plan: true },
      }));
    if (subscription === null)
      throw new AppError({
        code: 'TENANT_SUBSCRIPTION_NOT_FOUND',
        message: 'Nenhuma assinatura foi encontrada para este estabelecimento.',
        statusCode: 404,
      });

    const plan = await this.client.commercialPlan.findUniqueOrThrow({
      where: { id: subscription.planId },
      include: { limits: true },
    });

    const usageByKey = await this.usageByKey(
      tenantId,
      subscription.currentPeriodStartsAt,
      subscription.currentPeriodEndsAt,
    );

    return TenantSubscriptionResponseSchema.parse({
      subscription: mapSubscription(subscription),
      plan: mapPlan(plan),
      limits: plan.limits.map((limit) => ({
        key: limit.key,
        valueType: limit.valueType,
        integerValue: limit.integerValue === null ? null : limit.integerValue.toString(),
        booleanValue: limit.booleanValue,
        stringValue: limit.stringValue,
        usage: usageByKey.get(limit.key) ?? null,
      })),
    });
  }

  private async usageByKey(tenantId: bigint, periodStartsAt: Date, periodEndsAt: Date) {
    const [units, members, professionals, monthlyAppointments] = await Promise.all([
      this.client.businessUnit.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.client.tenantMembership.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.client.professional.count({ where: { tenantId, active: true } }),
      this.client.appointment.count({
        where: { tenantId, createdAt: { gte: periodStartsAt, lte: periodEndsAt } },
      }),
    ]);
    return new Map<string, number>([
      ['units.max', units],
      ['members.max', members],
      ['professionals.max', professionals],
      ['monthly_appointments.max', monthlyAppointments],
    ]);
  }
}
