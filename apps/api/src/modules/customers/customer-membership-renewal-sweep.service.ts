import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { addMembershipPeriod, membershipAnchorDay } from './customer-membership-period.js';
import { isCustomerMembershipFeatureEnabled } from './customer-membership-feature-gate.js';

export interface RenewalSweepResult {
  scanned: number;
  renewedChargesCreated: number;
  markedPastDue: number;
  cancelAtPeriodEndApplied: number;
  skipped: number;
  failed: number;
}

const systemActor = { userId: null, sessionId: null };

interface MembershipGatewayCancellation {
  cancelPendingMembershipCharges(
    tenantId: bigint,
    chargeIds: bigint[],
    actor: typeof systemActor,
  ): Promise<void>;
}

type SweepOutcome = 'renewedChargesCreated' | 'cancelAtPeriodEndApplied' | 'skipped';

interface ProcessResult {
  outcome: SweepOutcome;
  pendingGatewayChargeIds: bigint[];
}

export class CustomerMembershipRenewalSweepService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly batchSize = 50,
    private readonly gatewayCancellation?: MembershipGatewayCancellation,
  ) {}

  public async run(now = new Date()): Promise<RenewalSweepResult> {
    const result: RenewalSweepResult = {
      scanned: 0,
      renewedChargesCreated: 0,
      markedPastDue: 0,
      cancelAtPeriodEndApplied: 0,
      skipped: 0,
      failed: 0,
    };
    const candidates = await this.client.customerMembership.findMany({
      where: {
        OR: [
          { status: 'ACTIVE', nextBillingAt: { lte: now } },
          { status: 'PAST_DUE', cancelAtPeriodEnd: true },
        ],
      },
      select: { id: true, tenantId: true, publicId: true },
      orderBy: [{ nextBillingAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
    });
    result.scanned = candidates.length;
    for (const candidate of candidates) {
      try {
        const processed = await this.processOne(candidate.id, candidate.tenantId, now);
        result[processed.outcome] += 1;
        if (processed.outcome === 'renewedChargesCreated') result.markedPastDue += 1;
        if (
          processed.pendingGatewayChargeIds.length > 0 &&
          this.gatewayCancellation !== undefined
        ) {
          await this.gatewayCancellation.cancelPendingMembershipCharges(
            candidate.tenantId,
            processed.pendingGatewayChargeIds,
            systemActor,
          );
        }
      } catch (error) {
        result.failed += 1;
        await this.client.auditLog
          .create({
            data: {
              publicId: randomUUID(),
              tenantId: candidate.tenantId,
              ...systemActor,
              action: 'customer_membership.renewal_failed',
              targetType: 'customer_membership',
              targetPublicId: candidate.publicId,
              metadata: { error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' },
            },
          })
          .catch(() => undefined);
      }
    }
    return result;
  }

  private async processOne(id: bigint, tenantId: bigint, now: Date): Promise<ProcessResult> {
    return this.client.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: bigint }>>(
          Prisma.sql`SELECT id FROM customer_memberships WHERE tenant_id = ${tenantId} AND id = ${id} FOR UPDATE`,
        );
        if (locked.length === 0) return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        const membership = await tx.customerMembership.findFirst({
          where: { id, tenantId },
          include: {
            plan: true,
            charges: { where: { status: 'PAID' }, orderBy: { periodStart: 'desc' }, take: 1 },
            tenant: {
              select: {
                timezone: true,
                operatingModel: true,
                settings: { select: { membershipSalesEnabled: true } },
              },
            },
          },
        });
        if (!membership) return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        const isPastDueCancellation =
          membership.status === 'PAST_DUE' && membership.cancelAtPeriodEnd;
        if (
          !isPastDueCancellation &&
          (membership.status !== 'ACTIVE' ||
            !membership.nextBillingAt ||
            membership.nextBillingAt > now)
        )
          return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        if (membership.tenant.operatingModel !== 'MEMBERSHIP') {
          await tx.auditLog.create({
            data: {
              publicId: randomUUID(),
              tenantId: membership.tenantId,
              ...systemActor,
              action: 'customer_membership.renewal_operating_model_inconsistent',
              targetType: 'customer_membership',
              targetPublicId: membership.publicId,
            },
          });
          return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        }
        if (membership.cancelAtPeriodEnd) {
          const reserved = await tx.customerMembershipUsage.count({
            where: { tenantId, membershipId: id, status: 'RESERVED' },
          });
          const openAppointments = await tx.appointment.count({
            where: {
              tenantId: membership.tenantId,
              membershipUsages: { some: { tenantId, membershipId: id } },
              status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
              chargeSource: { in: ['MEMBERSHIP_INCLUDED', 'MEMBERSHIP_DISCOUNT'] },
            },
          });
          if (reserved > 0 || openAppointments > 0)
            throw new Error(
              'Cancelamento no fim do período bloqueado por usage/agendamento aberto.',
            );
          await tx.customerMembership.updateMany({
            where: { id, tenantId },
            data: {
              status: 'CANCELED',
              activeKey: null,
              canceledAt: membership.currentPeriodEnd ?? now,
              cancelAtPeriodEnd: false,
              nextBillingAt: null,
            },
          });
          await tx.customerMembershipCharge.updateMany({
            where: { tenantId, membershipId: id, status: 'PENDING' },
            data: { status: 'CANCELED' },
          });
          const gatewayCharges = await tx.paymentGatewayCharge.findMany({
            where: {
              tenantId: membership.tenantId,
              membershipCharge: { membershipId: id },
              originType: 'MEMBERSHIP_CHARGE',
              status: { in: ['PENDING', 'PROCESSING'] },
            },
            select: { id: true },
          });
          await tx.auditLog.create({
            data: {
              publicId: randomUUID(),
              tenantId: membership.tenantId,
              ...systemActor,
              action: 'customer_membership.cancel_period_end_applied',
              targetType: 'customer_membership',
              targetPublicId: membership.publicId,
              metadata: {
                fromStatus: membership.status,
                effectiveAt: (membership.currentPeriodEnd ?? now).toISOString(),
              },
            },
          });
          return {
            outcome: 'cancelAtPeriodEndApplied',
            pendingGatewayChargeIds: gatewayCharges.map((charge) => charge.id),
          };
        }
        if (
          !isCustomerMembershipFeatureEnabled({
            operatingModel: membership.tenant.operatingModel,
            membershipSalesEnabled: membership.tenant.settings?.membershipSalesEnabled === true,
          })
        ) {
          await tx.auditLog.create({
            data: {
              publicId: randomUUID(),
              tenantId: membership.tenantId,
              ...systemActor,
              action: 'customer_membership.renewal_sales_disabled',
              targetType: 'customer_membership',
              targetPublicId: membership.publicId,
            },
          });
          return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        }
        const lastPaid = membership.charges[0];
        if (!lastPaid) return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        if (membership.currentPeriodEnd === null)
          return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        const snapshot = lastPaid.planSnapshot;
        const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        if (!parsed || typeof parsed !== 'object')
          throw new Error('Snapshot contratado ausente para renovação.');
        const contractedInterval = (
          parsed as { billingInterval?: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' }
        ).billingInterval;
        if (contractedInterval === undefined)
          throw new Error('Intervalo contratado ausente para renovação.');
        const periodStart = membership.currentPeriodEnd;
        const anchor = membershipAnchorDay(
          membership.charges.at(-1)!.periodStart,
          membership.tenant.timezone,
        );
        const periodEnd = addMembershipPeriod(
          periodStart,
          contractedInterval,
          membership.tenant.timezone,
          anchor,
        );
        const existing = await tx.customerMembershipCharge.findFirst({
          where: { tenantId, membershipId: id, periodStart },
        });
        if (existing) return { outcome: 'skipped', pendingGatewayChargeIds: [] };
        const contractedPrice = (parsed as { priceCents?: number | string }).priceCents;
        const amountCents =
          contractedPrice === undefined ? lastPaid.amountCents : BigInt(String(contractedPrice));
        await tx.customerMembershipCharge.create({
          data: {
            publicId: randomUUID(),
            tenantId: membership.tenantId,
            membershipId: id,
            periodStart,
            periodEnd,
            amountCents,
            status: 'PENDING',
            dueAt: periodStart,
            planSnapshot: parsed,
          },
        });
        await tx.customerMembership.updateMany({
          where: { id, tenantId },
          data: { status: 'PAST_DUE' },
        });
        await tx.auditLog.create({
          data: {
            publicId: randomUUID(),
            tenantId: membership.tenantId,
            ...systemActor,
            action: 'customer_membership.renewal_charge_created',
            targetType: 'customer_membership',
            targetPublicId: membership.publicId,
            metadata: {
              periodStart: periodStart.toISOString(),
              periodEnd: periodEnd.toISOString(),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            publicId: randomUUID(),
            tenantId: membership.tenantId,
            ...systemActor,
            action: 'customer_membership.past_due',
            targetType: 'customer_membership',
            targetPublicId: membership.publicId,
          },
        });
        return { outcome: 'renewedChargesCreated', pendingGatewayChargeIds: [] };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
