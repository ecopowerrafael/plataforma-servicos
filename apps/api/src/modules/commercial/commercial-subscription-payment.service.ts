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

      // A carteira só participa de pagamentos confirmados a partir do vínculo.
      // Isso impede que a atribuição tardia de um tenant gere comissão sobre histórico anterior.
      if (input.paidAt < assignment.assignedAt) {
        return { generated: 0, reason: 'Payment predates commercial assignment', skipped: true };
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

      // 5. Update commissions with paymentId and paymentSource
      for (const commission of commissions) {
        await tx.commercialCommission.update({
          where: { id: commission.id },
          data: {
            paymentId: input.paymentId,
            paymentSource: input.source,
          },
        });
      }

      // 6. Create wallet entries for audit trail
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
   * Idempotent by paymentId - multiple refund webhooks create only 1 reversal
   */
  async reverseSubscriptionPayment(input: {
    paymentId: string;
    reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Find commissions by paymentId
      const commissions = await tx.commercialCommission.findMany({
        where: {
          paymentId: input.paymentId,
          status: { in: ['AVAILABLE', 'PENDING'] },
        },
      });

      let reversed = 0;

      for (const commission of commissions) {
        // Check if already reversed (idempotency)
        const existingReversal = await tx.commercialWalletEntry.findFirst({
          where: {
            commissionId: commission.id,
            type: 'REVERSAL',
          },
        });

        if (existingReversal) continue; // Already reversed

        // Create reversal entry
        await tx.commercialWalletEntry.create({
          data: {
            publicId: randomUUID(),
            commercialAccountId: commission.commercialAccountId,
            type: 'REVERSAL',
            amountCents: -BigInt(commission.commissionAmountCents),
            tenantId: commission.tenantId,
            subscriptionId: commission.subscriptionId,
            commissionId: commission.id,
            description: `Estorno comissão: ${input.reason}`,
            createdByUserId: null,
          },
        });

        // Mark commission as reversed
        await tx.commercialCommission.update({
          where: { id: commission.id },
          data: { status: 'REVERSED', reversedAt: new Date() },
        });

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
