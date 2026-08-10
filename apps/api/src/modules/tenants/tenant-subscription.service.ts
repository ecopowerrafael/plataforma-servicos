import { randomUUID } from 'node:crypto';

import { TenantSubscriptionResponseSchema } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { mapPlan, mapSubscription } from '../platform/platform.service.js';
import { TenantCommercialPolicyService } from '../platform/tenant-commercial-policy.service.js';
import { TenantCommercialStatusResolver } from '../platform/tenant-commercial-status.resolver.js';

export class TenantSubscriptionService {
  private readonly policyService: TenantCommercialPolicyService;
  private readonly statusResolver: TenantCommercialStatusResolver;

  public constructor(private readonly client: PrismaClient) {
    this.policyService = new TenantCommercialPolicyService(client);
    this.statusResolver = new TenantCommercialStatusResolver();
  }

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
      include: { limits: true, benefits: { where: { enabled: true }, orderBy: { sortOrder: 'asc' } } },
    });

    const usageByKey = await this.usageByKey(
      tenantId,
      subscription.currentPeriodStartsAt,
      subscription.currentPeriodEndsAt,
    );

    const policy = await this.policyService.getOrCreateRaw();
    const commercial = this.statusResolver.resolve(subscription, policy);

    return TenantSubscriptionResponseSchema.parse({
      subscription: mapSubscription(subscription),
      plan: mapPlan(plan),
      commercial,
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

  public async selectPlan(tenantId: bigint, planPublicId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL') {
    const plan = await this.client.commercialPlan.findUnique({ where: { publicId: planPublicId }, include: { billingOptions: true } });
    if (plan?.status !== 'ACTIVE' || !plan.isPublic)
      throw new AppError({ code: 'PLAN_UNAVAILABLE', message: 'O plano escolhido não está disponível.', statusCode: 409 });
    const option = plan.billingOptions.find((item) => item.billingCycle === billingCycle && item.active);
    if (option === undefined)
      throw new AppError({ code: 'BILLING_OPTION_UNAVAILABLE', message: 'A periodicidade escolhida não está disponível para este plano.', statusCode: 409 });
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + (billingCycle === 'ANNUAL' ? 12 : billingCycle === 'SEMIANNUAL' ? 6 : billingCycle === 'QUARTERLY' ? 3 : 1));
    const active = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    const subscription = active === null
      ? await this.client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId, planId: plan.id, status: 'ACTIVE', startsAt: now, currentPeriodStartsAt: now, currentPeriodEndsAt: endsAt, priceCents: option.priceCents, currency: plan.currency, billingCycle, effectiveKey: 'EFFECTIVE' } })
      : await this.client.tenantSubscription.update({ where: { id: active.id }, data: { planId: plan.id, priceCents: option.priceCents, currency: plan.currency, billingCycle, currentPeriodStartsAt: now, currentPeriodEndsAt: endsAt } });
    await this.client.subscriptionHistory.create({ data: { publicId: randomUUID(), subscriptionId: subscription.id, tenantId, action: active === null ? 'CREATED' : 'PLAN_CHANGED', previousPlanId: active?.planId ?? null, newPlanId: plan.id, previousStatus: active?.status ?? null, newStatus: subscription.status, reason: 'Plano selecionado pelo proprietário.' } });
    return this.get(tenantId);
  }

  private async usageByKey(tenantId: bigint, periodStartsAt: Date, periodEndsAt: Date) {
    const [units, members, professionals, services, monthlyAppointments] = await Promise.all([
      this.client.businessUnit.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.client.tenantMembership.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.client.professional.count({ where: { tenantId, active: true } }),
      this.client.service.count({ where: { tenantId, active: true } }),
      this.client.appointment.count({
        where: { tenantId, createdAt: { gte: periodStartsAt, lte: periodEndsAt } },
      }),
    ]);
    return new Map<string, number>([
      ['units.max', units],
      ['members.max', members],
      ['professionals.max', professionals],
      ['services.max', services],
      ['monthly_appointments.max', monthlyAppointments],
    ]);
  }
}
