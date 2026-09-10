import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

const months: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 };

export class SubscriptionPlanChangeService {
  public constructor(private readonly client: PrismaClient) {}

  public async applyPlanChange(changePublicId: string, actorId: bigint | null = null) {
    return this.client.$transaction(async (tx) => {
      const change = await tx.subscriptionPlanChange.findUnique({ where: { publicId: changePublicId }, include: { subscription: true, targetPlan: { include: { billingOptions: true } } } });
      if (!change) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_FOUND', message: 'Alteração de assinatura não encontrada.', statusCode: 404 });
      if (change.status === 'APPLIED') return change;
      if (change.status !== 'PAID') throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_PAID', message: 'A alteração ainda não foi paga.', statusCode: 409 });
      await tx.$queryRaw`SELECT id FROM tenant_subscriptions WHERE id = ${change.subscriptionId} FOR UPDATE`;
      const subscription = await tx.tenantSubscription.findUniqueOrThrow({ where: { id: change.subscriptionId } });
      if (subscription.planId !== change.currentPlanId || subscription.billingCycle !== change.currentBillingCycle || subscription.currentPeriodStartsAt.getTime() !== change.currentPeriodStartsAt.getTime() || subscription.currentPeriodEndsAt.getTime() !== change.currentPeriodEndsAt.getTime()) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_STALE', message: 'A assinatura mudou desde a criação desta alteração. Solicite uma nova cotação.', statusCode: 409 });
      const option = change.targetPlan.billingOptions.find((item) => item.active && item.billingCycle === change.targetBillingCycle);
      if (!option) throw new AppError({ code: 'BILLING_OPTION_UNAVAILABLE', message: 'A opção de cobrança não está disponível.', statusCode: 409 });
      const startsAt = change.appliedAt ?? new Date();
      const endsAt = new Date(startsAt);
      endsAt.setUTCMonth(endsAt.getUTCMonth() + (months[change.targetBillingCycle] ?? 1));
      await tx.tenantSubscription.update({ where: { id: subscription.id }, data: { planId: change.targetPlanId, billingCycle: change.targetBillingCycle, priceCents: option.priceCents, currency: change.currency, currentPeriodStartsAt: startsAt, currentPeriodEndsAt: endsAt, scheduledPlanId: null, scheduledBillingCycle: null, scheduledEffectiveAt: null, status: 'ACTIVE', effectiveKey: 'EFFECTIVE', lastPaymentAt: change.paidAt ?? startsAt } });
      const applied = await tx.subscriptionPlanChange.update({ where: { id: change.id }, data: { status: 'APPLIED', appliedAt: startsAt, effectiveAt: startsAt } });
      await tx.subscriptionHistory.create({ data: { publicId: randomUUID(), subscriptionId: subscription.id, tenantId: subscription.tenantId, action: 'PLAN_CHANGED', previousPlanId: change.currentPlanId, newPlanId: change.targetPlanId, previousStatus: subscription.status, newStatus: 'ACTIVE', reason: 'Mudança de plano aplicada após confirmação de pagamento.', performedByUserId: actorId, metadata: { changePublicId } } });
      return applied;
    });
  }

  public async confirmPaid(changePublicId: string, provider: string, reference: string | null, actorId: bigint | null = null) {
    const change = await this.client.subscriptionPlanChange.findUnique({ where: { publicId: changePublicId } });
    if (!change) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_FOUND', message: 'Alteração de assinatura não encontrada.', statusCode: 404 });
    if (change.status === 'APPLIED') return change;
    if (change.status !== 'PENDING_PAYMENT') throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_PENDING', message: 'A alteração não está pendente de pagamento.', statusCode: 409 });
    if (change.expiresAt <= new Date()) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_EXPIRED', message: 'A alteração de assinatura expirou.', statusCode: 409 });
    await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { status: 'PAID', paidAt: new Date(), paymentProvider: provider, paymentReference: reference } });
    return this.applyPlanChange(changePublicId, actorId);
  }
}
