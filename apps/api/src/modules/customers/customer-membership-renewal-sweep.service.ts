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

export class CustomerMembershipRenewalSweepService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly batchSize = 50,
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
      where: { status: 'ACTIVE', nextBillingAt: { lte: now } },
      select: { id: true, tenantId: true, publicId: true },
      orderBy: [{ nextBillingAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
    });
    result.scanned = candidates.length;
    for (const candidate of candidates) {
      try {
        const outcome = await this.processOne(candidate.id, now);
        result[outcome] += 1;
        if (outcome === 'renewedChargesCreated') result.markedPastDue += 1;
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

  private async processOne(
    id: bigint,
    now: Date,
  ): Promise<'renewedChargesCreated' | 'cancelAtPeriodEndApplied' | 'skipped'> {
    return this.client.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: bigint }>>(
          Prisma.sql`SELECT id FROM customer_memberships WHERE id = ${id} FOR UPDATE`,
        );
        if (locked.length === 0) return 'skipped';
        const membership = await tx.customerMembership.findUnique({
          where: { id },
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
        if (
          !membership ||
          membership.status !== 'ACTIVE' ||
          !membership.nextBillingAt ||
          membership.nextBillingAt > now
        )
          return 'skipped';
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
          return 'skipped';
        }
        if (membership.cancelAtPeriodEnd) {
          const reserved = await tx.customerMembershipUsage.count({
            where: { membershipId: id, status: 'RESERVED' },
          });
          const openAppointments = await tx.appointment.count({
            where: {
              tenantId: membership.tenantId,
              membershipUsages: { some: { membershipId: id } },
              status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
              chargeSource: { in: ['MEMBERSHIP_INCLUDED', 'MEMBERSHIP_DISCOUNT'] },
            },
          });
          if (reserved > 0 || openAppointments > 0)
            throw new Error(
              'Cancelamento no fim do período bloqueado por usage/agendamento aberto.',
            );
          await tx.customerMembership.update({
            where: { id },
            data: {
              status: 'CANCELED',
              canceledAt: membership.currentPeriodEnd ?? now,
              cancelAtPeriodEnd: false,
              nextBillingAt: null,
            },
          });
          await tx.auditLog.create({
            data: {
              publicId: randomUUID(),
              tenantId: membership.tenantId,
              ...systemActor,
              action: 'customer_membership.cancel_period_end_applied',
              targetType: 'customer_membership',
              targetPublicId: membership.publicId,
              metadata: { effectiveAt: (membership.currentPeriodEnd ?? now).toISOString() },
            },
          });
          return 'cancelAtPeriodEndApplied';
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
          return 'skipped';
        }
        const lastPaid = membership.charges[0];
        if (!lastPaid) return 'skipped';
        if (membership.currentPeriodEnd === null) return 'skipped';
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
        const existing = await tx.customerMembershipCharge.findUnique({
          where: { membershipId_periodStart: { membershipId: id, periodStart } },
        });
        if (existing) return 'skipped';
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
        await tx.customerMembership.update({ where: { id }, data: { status: 'PAST_DUE' } });
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
        return 'renewedChargesCreated';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
