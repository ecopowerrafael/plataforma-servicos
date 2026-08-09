import { randomUUID } from 'node:crypto';

import { TenantCommercialPolicyService } from './tenant-commercial-policy.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const EFFECTIVE_KEY = 'EFFECTIVE';

/**
 * Varredura periódica que rebaixa assinaturas vencidas para PAST_DUE (com
 * carência) e suspende as que excederam a carência, conforme a política
 * comercial global. Nunca apaga ou altera dados do tenant — apenas o status
 * da assinatura e o histórico/auditoria.
 */
export class TenantCommercialSweepService {
  private readonly policyService: TenantCommercialPolicyService;

  public constructor(private readonly client: PrismaClient) {
    this.policyService = new TenantCommercialPolicyService(client);
  }

  public async run(now = new Date()): Promise<{ pastDued: number; suspended: number }> {
    const policy = await this.policyService.getOrCreateRaw();
    const graceEndsAt = new Date(now.getTime() + policy.graceDays * 86_400_000);

    let pastDued = 0;
    let suspended = 0;

    const expiredTrials = await this.client.tenantSubscription.findMany({
      where: { status: 'TRIALING', trialEndsAt: { lte: now }, effectiveKey: EFFECTIVE_KEY },
    });
    for (const subscription of expiredTrials) {
      await this.transition(
        subscription,
        'PAST_DUE',
        graceEndsAt,
        'TRIAL_EXPIRED_PAST_DUE',
        'platform.subscription.trial_expired',
      );
      pastDued += 1;
    }

    const expiredPeriods = await this.client.tenantSubscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEndsAt: { lte: now }, effectiveKey: EFFECTIVE_KEY },
    });
    for (const subscription of expiredPeriods) {
      await this.transition(
        subscription,
        'PAST_DUE',
        graceEndsAt,
        'PERIOD_EXPIRED_PAST_DUE',
        'platform.subscription.period_expired',
      );
      pastDued += 1;
    }

    if (policy.autoSuspendAfterGrace) {
      const graceExpired = await this.client.tenantSubscription.findMany({
        where: {
          status: 'PAST_DUE',
          graceEndsAt: { lte: now },
          effectiveKey: EFFECTIVE_KEY,
        },
      });
      for (const subscription of graceExpired) {
        await this.transition(
          subscription,
          'SUSPENDED',
          null,
          'GRACE_EXPIRED_SUSPENDED',
          'platform.subscription.suspended_after_grace',
        );
        suspended += 1;
      }
    }

    return { pastDued, suspended };
  }

  private async transition(
    subscription: { id: bigint; tenantId: bigint; status: string; publicId: string },
    nextStatus: 'PAST_DUE' | 'SUSPENDED',
    graceEndsAt: Date | null,
    historyAction: string,
    auditAction: string,
  ): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      const updated = await transaction.tenantSubscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          ...(nextStatus === 'PAST_DUE' ? { graceEndsAt } : {}),
          ...(nextStatus === 'SUSPENDED' ? { suspendedAt: new Date() } : {}),
        },
      });
      await transaction.subscriptionHistory.create({
        data: {
          publicId: randomUUID(),
          subscriptionId: updated.id,
          tenantId: updated.tenantId,
          action: historyAction,
          previousStatus: subscription.status as never,
          newStatus: nextStatus,
          performedByUserId: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          publicId: randomUUID(),
          action: auditAction,
          targetType: 'tenant_subscription',
          targetPublicId: updated.publicId,
          tenantId: updated.tenantId,
          userId: null,
          sessionId: null,
        },
      });
    });
  }
}
