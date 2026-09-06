import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../database-client/client.js';
import { CommercialCommissionService } from './commercial-commission.service.js';

type PaymentSource = 'GATEWAY' | 'PIX' | 'CARD' | 'MANUAL_ADMIN' | 'COMMERCIAL_WALLET';

/**
 * FASE 3: Commission generation for normal subscription payments
 * Central handler for all subscription payment confirmations
 * Integrates commission engine with automatic distribution
 */
export class CommercialSubscriptionPaymentService {
  private commissionService: CommercialCommissionService;

  constructor(private readonly prisma: PrismaClient) {
    this.commissionService = new CommercialCommissionService(prisma);
  }

  /**
   * Handle subscription payment confirmation
   * Generates commissions for normal payments (not wallet-based)
   * Idempotent by paymentId
   */
  async confirmSubscriptionPayment(input: {
    tenantId: bigint;
    subscriptionId: bigint;
    paymentId: string;
    amountCents: bigint;
    source: PaymentSource;
    paidAt: Date;
  }) {
    // SKIP if source is COMMERCIAL_WALLET (already handled by manual payment service)
    if (input.source === 'COMMERCIAL_WALLET') {
      return { skipped: true, reason: 'Commercial wallet payment handled separately' };
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Find assignment
      const assignment = await tx.tenantCommercialAssignment.findUnique({
        where: { tenantId: input.tenantId },
      });

      if (!assignment) {
        return { generated: 0, reason: 'No commercial assignment' };
      }

      // 2. Get subscription & plan
      const subscription = await tx.tenantSubscription.findUnique({
        where: { id: input.subscriptionId },
        include: { plan: true },
      });

      if (!subscription?.plan) {
        return { generated: 0, reason: 'Subscription or plan not found' };
      }

      // 3. Check idempotency
      const existing = await tx.commercialWalletEntry.findFirst({
        where: { description: { contains: `payment_${input.paymentId}` } },
      });

      if (existing) {
        return { generated: 0, reason: 'Payment already processed', skipped: true };
      }

      // 4. Generate commissions via existing commission service
      // For normal payments, manager receives commission normally (not anti-cycle)
      const assignmentData = {
        ...(assignment.managerId && { managerId: assignment.managerId }),
        ...(assignment.representativeId && { representativeId: assignment.representativeId }),
        ...(assignment.sellerId && { sellerId: assignment.sellerId }),
      };

      const commissions = await this.commissionService.createFromSubscription(
        input.subscriptionId,
        input.tenantId,
        input.amountCents,
        subscription.plan.id,
        assignmentData,
      );

      // 5. Create wallet entries for audit trail
      for (const commission of commissions) {
        await tx.commercialWalletEntry.create({
          data: {
            publicId: randomUUID(),
            commercialAccountId: commission.commercialAccountId,
            type: 'COMMISSION_CREDIT',
            amountCents: BigInt(commission.commissionAmountCents),
            tenantId: input.tenantId,
            subscriptionId: input.subscriptionId,
            commissionId: commission.id,
            description: `Comissão pagamento normal (${input.source}) - payment_${input.paymentId}`,
            createdByUserId: null,
          },
        });
      }

      return { generated: commissions.length, source: input.source };
    });
  }

  /**
   * Revert commissions when payment is refunded
   */
  async reverseSubscriptionPayment(input: {
    paymentId: string;
    reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const entries = await tx.commercialWalletEntry.findMany({
        where: {
          description: { contains: `payment_${input.paymentId}` },
          type: 'COMMISSION_CREDIT',
        },
        include: { commission: true },
      });

      let reversed = 0;

      for (const entry of entries) {
        if (entry.commission?.status !== 'AVAILABLE') continue;

        // Create reversal entry
        await tx.commercialWalletEntry.create({
          data: {
            publicId: randomUUID(),
            commercialAccountId: entry.commercialAccountId,
            type: 'REVERSAL',
            amountCents: -entry.amountCents,
            tenantId: entry.tenantId,
            subscriptionId: entry.subscriptionId,
            commissionId: entry.commissionId,
            description: `Estorno comissão: ${input.reason}`,
            createdByUserId: null,
          },
        });

        // Mark commission as reversed
        if (entry.commission) {
          await tx.commercialCommission.update({
            where: { id: entry.commission.id },
            data: { status: 'REVERSED', reversedAt: new Date() },
          });
        }

        reversed++;
      }

      return { reversed };
    });
  }

  /**
   * Get commissions for a payment
   */
  async getPaymentCommissions(paymentId: string) {
    const entries = await this.prisma.commercialWalletEntry.findMany({
      where: {
        description: { contains: `payment_${paymentId}` },
        type: { in: ['COMMISSION_CREDIT', 'REVERSAL'] },
      },
      include: { commission: true },
    });

    return entries.map((e) => ({
      publicId: e.publicId,
      accountId: e.commercialAccountId,
      amount: Number(e.amountCents),
      type: e.type,
      status: e.commission?.status,
    }));
  }
}
