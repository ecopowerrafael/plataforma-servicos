import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors/AppError.js';
import type { PrismaClient } from '../../database-client/client.js';
import { CommercialWalletService } from './commercial-wallet.service.js';
import { CommercialCommissionService } from './commercial-commission.service.js';
import { calculateRenewalPeriod } from '../tenants/billing-period.helper.js';
import { SubscriptionPlanChangeService } from '../tenants/subscription-plan-change.service.js';

export function calculateSettlement(amountCents: bigint, commissionBps: number) {
  const commissionAmountCents = (amountCents * BigInt(commissionBps)) / 10000n;
  return {
    collectedCents: -amountCents,
    commissionCents: commissionAmountCents,
    netWalletCents: commissionAmountCents - amountCents,
  };
}

export class CommercialManualPaymentService {
  private walletService: CommercialWalletService;
  private commissionService: CommercialCommissionService;

  constructor(private readonly prisma: PrismaClient) {
    this.walletService = new CommercialWalletService(prisma);
    this.commissionService = new CommercialCommissionService(prisma);
  }

  /** Canonical settlement for money physically received by a commercial account. */
  async settleSubscription(input: {
    commercialAccountId: bigint;
    tenantPublicId: string;
    amountCents?: bigint;
    paymentMethod: string;
    currency?: string;
    receivedAt?: Date;
    idempotencyKey: string;
    receiverType?: 'REPRESENTATIVE' | 'ADMINISTRATOR';
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM commercial_accounts WHERE id = ${input.commercialAccountId} FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({ where: { publicId: input.tenantPublicId } });
      if (!tenant) throw new AppError({ code: 'COMMERCIAL_TENANT_NOT_FOUND', message: 'Tenant não encontrado', statusCode: 404 });
      const assignment = await tx.tenantCommercialAssignment.findUnique({ where: { tenantId: tenant.id } });
      if (!assignment || ![assignment.managerId, assignment.representativeId, assignment.sellerId].includes(input.commercialAccountId)) {
        throw new AppError({ code: 'COMMERCIAL_TENANT_ACCESS_DENIED', message: 'A conta não pode registrar pagamentos deste tenant', statusCode: 403 });
      }
      const subscription = await tx.tenantSubscription.findFirst({
        where: { tenantId: tenant.id, effectiveKey: 'EFFECTIVE' },
        include: { plan: true }, orderBy: { createdAt: 'desc' },
      }) ?? await tx.tenantSubscription.findFirst({ where: { tenantId: tenant.id }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
      if (!subscription?.plan) throw new AppError({ code: 'COMMERCIAL_SUBSCRIPTION_NOT_FOUND', message: 'Assinatura não encontrada', statusCode: 404 });
      const amountCents = input.amountCents ?? subscription.priceCents;
      const currency = input.currency ?? 'BRL';
      if (amountCents !== subscription.priceCents || currency !== subscription.currency) throw new AppError({ code: 'COMMERCIAL_PAYMENT_VALUE_INVALID', message: 'Valor ou moeda divergente do ciclo', statusCode: 400 });
      const existing = await tx.commercialManualPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return this.buildPaymentResponse(existing);
      const paid = await tx.commercialManualPayment.findFirst({ where: { subscriptionId: subscription.id, status: 'PROCESSED' } });
      if (paid) throw new AppError({ code: 'COMMERCIAL_SUBSCRIPTION_ALREADY_PAID', message: 'O ciclo já foi pago', statusCode: 409 });
      const now = input.receivedAt ?? new Date();
      const receiverType = input.receiverType ?? 'REPRESENTATIVE';
      const payment = await tx.commercialManualPayment.create({ data: {
        publicId: randomUUID(), tenantId: tenant.id, subscriptionId: subscription.id,
        managerAccountId: input.commercialAccountId, amountCents, currency,
        paymentMethod: input.paymentMethod, receiverType, receivedAt: now,
        idempotencyKey: input.idempotencyKey, status: 'PROCESSED', processedAt: now,
      }});
      if (receiverType === 'REPRESENTATIVE') {
        await tx.commercialWalletEntry.create({ data: { publicId: randomUUID(), commercialAccountId: input.commercialAccountId, type: 'PLAN_PAYMENT_DEBIT', amountCents: -amountCents, tenantId: tenant.id, subscriptionId: subscription.id, description: `TENANT_PAYMENT_COLLECTED:${payment.publicId}` } });
      } else {
        await tx.platformLedgerEntry.create({ data: { publicId: randomUUID(), tenantId: tenant.id, subscriptionId: subscription.id, manualPaymentId: payment.id, amountCents, currency: subscription.currency, type: 'SUBSCRIPTION_PAYMENT', description: `Pagamento manual da plataforma:${payment.publicId}` } });
      }
      const account = await tx.commercialAccount.findUniqueOrThrow({ where: { id: input.commercialAccountId } });
      const commissionAmountCents = calculateSettlement(amountCents, account.defaultCommissionBps).commissionCents;
      if (commissionAmountCents > 0n) {
        const commission = await tx.commercialCommission.create({ data: { publicId: randomUUID(), commercialAccountId: input.commercialAccountId, tenantId: tenant.id, subscriptionId: subscription.id, baseAmountCents: amountCents, percentageBpsSnapshot: account.defaultCommissionBps, commissionAmountCents, roleSnapshot: 'RECEIVER', status: 'AVAILABLE', paymentId: payment.publicId, paymentSource: receiverType === 'ADMINISTRATOR' ? 'MANUAL_ADMIN' : 'MANUAL' } });
        await tx.commercialWalletEntry.create({ data: { publicId: randomUUID(), commercialAccountId: input.commercialAccountId, type: 'COMMISSION_CREDIT', amountCents: commissionAmountCents, tenantId: tenant.id, subscriptionId: subscription.id, commissionId: commission.id, description: `COMMISSION_EARNED:${payment.publicId}` } });
      }
      await tx.tenantSubscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE', effectiveKey: 'EFFECTIVE', lastPaymentAt: now, currentPeriodStartsAt: subscription.currentPeriodEndsAt, currentPeriodEndsAt: calculateRenewalPeriod(subscription.currentPeriodEndsAt, subscription.billingCycle).periodEndsAt } });
      await tx.subscriptionHistory.create({ data: { publicId: randomUUID(), subscriptionId: subscription.id, tenantId: tenant.id, action: 'PAYMENT_CONFIRMED', previousStatus: subscription.status, newStatus: 'ACTIVE', previousPlanId: subscription.planId, newPlanId: subscription.planId, reason: `Manual subscription settlement (${receiverType})`, createdAt: now } });
      await tx.auditLog.create({ data: { publicId: randomUUID(), tenantId: tenant.id, action: 'commercial.subscription.payment_settled', targetType: 'commercial_manual_payment', targetPublicId: payment.publicId, metadata: { receiverType, amountCents: amountCents.toString(), paymentMethod: input.paymentMethod, idempotencyKey: input.idempotencyKey } } });
      return this.buildPaymentResponse(payment);
    });
  }

  async settleAdministratorSubscription(input: Omit<Parameters<CommercialManualPaymentService['settleSubscription']>[0], 'commercialAccountId' | 'receiverType'>) {
    const tenant = await this.prisma.tenant.findUnique({ where: { publicId: input.tenantPublicId } });
    if (!tenant) throw new AppError({ code: 'COMMERCIAL_TENANT_NOT_FOUND', message: 'Tenant não encontrado', statusCode: 404 });
    const assignment = await this.prisma.tenantCommercialAssignment.findUnique({ where: { tenantId: tenant.id } });
    if (!assignment?.managerId) throw new AppError({ code: 'COMMERCIAL_TENANT_ACCESS_DENIED', message: 'Tenant sem conta comercial responsável', statusCode: 409 });
    return this.settleSubscription({ ...input, commercialAccountId: assignment.managerId, receiverType: 'ADMINISTRATOR' });
  }

  /** Debits exactly one pending subscription change from the commercial wallet. */
  async paySubscriptionChangeWithWallet(managerAccountId: bigint, changePublicId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM commercial_accounts WHERE id = ${managerAccountId} FOR UPDATE`;
      const change = await tx.subscriptionPlanChange.findUnique({ where: { publicId: changePublicId } });
      if (!change) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_FOUND', message: 'Alteração de assinatura não encontrada', statusCode: 404 });
      const assignment = await tx.tenantCommercialAssignment.findUnique({ where: { tenantId: change.tenantId } });
      if (!assignment || assignment.managerId !== managerAccountId) throw new AppError({ code: 'COMMERCIAL_TENANT_ACCESS_DENIED', message: 'Você não tem acesso a este cliente', statusCode: 403 });
      // A retry after the payment/application webhook must be a no-op. The
      // wallet debit is already committed and the plan-change service is
      // itself idempotent for PAID/APPLIED states.
      if (change.status === 'APPLIED') return change;
      if (change.status !== 'PENDING_PAYMENT') throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_PENDING', message: 'A alteração não está pendente de pagamento', statusCode: 409 });
      if (change.expiresAt <= new Date()) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_EXPIRED', message: 'A alteração expirou', statusCode: 409 });
      const existing = await tx.commercialWalletEntry.findFirst({ where: { commercialAccountId: managerAccountId, subscriptionId: change.subscriptionId, description: { contains: `change_${change.publicId}` } } });
      if (existing) return change;
      const balance = await tx.commercialWalletEntry.aggregate({ where: { commercialAccountId: managerAccountId }, _sum: { amountCents: true } });
      if ((balance._sum.amountCents ?? 0n) < change.amountDueCents) throw new AppError({ code: 'COMMERCIAL_WALLET_INSUFFICIENT_BALANCE', message: 'Saldo insuficiente na carteira', statusCode: 402 });
      await tx.commercialWalletEntry.create({ data: { publicId: randomUUID(), commercialAccountId: managerAccountId, type: 'PLAN_PAYMENT_DEBIT', amountCents: -change.amountDueCents, tenantId: change.tenantId, subscriptionId: change.subscriptionId, description: `Pagamento de change_${change.publicId}`, createdByUserId: managerAccountId } });
      return tx.subscriptionPlanChange.update({ where: { id: change.id }, data: { status: 'PAID', paidAt: new Date(), paymentProvider: 'COMMERCIAL_WALLET', paymentReference: `wallet:${managerAccountId}` } });
    });
    if (result.status === 'PAID') await new SubscriptionPlanChangeService(this.prisma).applyPlanChange(result.publicId, managerAccountId);
    return result;
  }

  /**
   * Pay subscription using manager's wallet balance
   * Transaction-based, idempotent, with anti-cycle commission logic
   *
   * Idempotency: deterministic key based on manager + subscription + period
   * (uniqueness enforced by DB constraint, not by pre-check)
   */
  async markSubscriptionPaid(
    managerAccountId: bigint,
    tenantPublicId: string,
  ) {

    // Execute full payment transaction with account lock (prevents race condition on balance)
    return this.prisma.$transaction(
      async (tx) => {
        // 0. Lock manager account to serialize payments on same wallet
        // This prevents: two concurrent payments both seeing sufficient balance
        await tx.$executeRaw`
          SELECT * FROM commercial_accounts
          WHERE id = ${managerAccountId}
          FOR UPDATE
        `;

        // 1. Resolve tenant
      const tenant = await tx.tenant.findUnique({
        where: { publicId: tenantPublicId },
      });

      if (!tenant) {
        throw new AppError({
          code: 'COMMERCIAL_TENANT_NOT_FOUND',
          message: 'Tenant não encontrado',
          statusCode: 404,
        });
      }

      // 2. Verify manager has access to this tenant
      const assignment = await tx.tenantCommercialAssignment.findUnique({
        where: { tenantId: tenant.id },
      });

      if (!assignment) {
        throw new AppError({
          code: 'COMMERCIAL_TENANT_NOT_ASSIGNED',
          message: 'Tenant não possui atribuição comercial',
          statusCode: 404,
        });
      }

      if (assignment.managerId !== managerAccountId) {
        throw new AppError({
          code: 'COMMERCIAL_TENANT_ACCESS_DENIED',
          message: 'Você não tem acesso a este cliente',
          statusCode: 403,
        });
      }

      // 3. Find active subscription
      const subscription = await tx.tenantSubscription.findFirst({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });

      if (!subscription) {
        throw new AppError({
          code: 'COMMERCIAL_SUBSCRIPTION_NOT_FOUND',
          message: 'Assinatura ativa não encontrada',
          statusCode: 404,
        });
      }

      if (!subscription.plan) {
        throw new AppError({
          code: 'COMMERCIAL_PLAN_NOT_FOUND',
          message: 'Plano não encontrado',
          statusCode: 500,
        });
      }

      // 4. Calculate amount from plan (backend calculates, never from frontend)
      const amountCents = subscription.plan.priceCents;

      // 5. Check wallet balance using transaction context
      const balance = await tx.commercialWalletEntry.aggregate({
        where: { commercialAccountId: managerAccountId },
        _sum: { amountCents: true },
      });

      const currentBalance = balance._sum.amountCents || 0n;

      if (currentBalance < BigInt(amountCents)) {
        throw new AppError({
          code: 'COMMERCIAL_WALLET_INSUFFICIENT_BALANCE',
          message: 'Saldo insuficiente na carteira',
          statusCode: 402,
        });
      }

      // 6. Generate idempotency key (deterministic based on period)
      const idempotencyKey = [
        managerAccountId,
        subscription.id,
        subscription.currentPeriodStartsAt.getTime(),
        subscription.currentPeriodEndsAt.getTime(),
      ].join(':');

      // 6b. Check if already paid in this period (idempotency at DB level)
      const existingPayment = await tx.commercialManualPayment.findUnique({
        where: { idempotencyKey },
      });

      if (existingPayment) {
        return this.buildPaymentResponse(existingPayment);
      }

      // 7. Create wallet debit entry
      await tx.commercialWalletEntry.create({
        data: {
          publicId: randomUUID(),
          commercialAccountId: managerAccountId,
          type: 'PLAN_PAYMENT_DEBIT',
          amountCents: -BigInt(amountCents),
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          description: `Pagamento manual do plano ${subscription.plan.name}`,
          createdByUserId: managerAccountId, // Use account's user as actor
        },
      });

      // 8. Record manual payment
      const manualPayment = await tx.commercialManualPayment.create({
        data: {
          publicId: randomUUID(),
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          managerAccountId,
          amountCents: BigInt(amountCents),
          idempotencyKey,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

      // 9. Calculate renewal period using shared helper
      const { periodStartsAt, periodEndsAt } = calculateRenewalPeriod(
        subscription.currentPeriodEndsAt,
        subscription.billingCycle,
      );

      // 10. Update subscription status to paid
      await tx.tenantSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          paidAt: new Date(),
          currentPeriodStartsAt: periodStartsAt,
          currentPeriodEndsAt: periodEndsAt,
        },
      });

      // 11. Generate commissions for eligible subordinates (ANTI-CYCLE: manager excluded)
      // Find all subordinates of this manager assigned to this tenant
      const managerAccount = await tx.commercialAccount.findUnique({
        where: { id: managerAccountId },
        include: { children: true },
      });

      if (managerAccount && managerAccount.children.length > 0) {
        // Check for representatives and sellers in tenant assignment
        const eligibleSubordinates = await tx.commercialAccount.findMany({
          where: {
            id: { in: managerAccount.children.map((c) => c.id) },
            active: true,
          },
        });

        for (const subordinate of eligibleSubordinates) {
          // Verify subordinate is assigned to this tenant (indirectly through hierarchy)
          const isAssignedToTenant = await tx.tenantCommercialAssignment.findUnique({
            where: { tenantId: tenant.id },
          });

          if (
            isAssignedToTenant &&
            (isAssignedToTenant.representativeId === subordinate.id ||
              isAssignedToTenant.sellerId === subordinate.id)
          ) {
            // Create commission for this subordinate (manager explicitly excluded)
            await this.commissionService.createFromSubscriptionWithExclusion(
              subordinate.id,
              subscription.id,
              subscription.plan.id,
            );
          }
        }
      }

      // 10. Return response
      return this.buildPaymentResponse(manualPayment);
    });
  }

  /**
   * Get subscription payment preview
   */
  async getPaymentPreview(managerAccountId: bigint, tenantPublicId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { publicId: tenantPublicId },
    });

    if (!tenant) {
      throw new AppError({
        code: 'COMMERCIAL_TENANT_NOT_FOUND',
        message: 'Tenant não encontrado',
        statusCode: 404,
      });
    }

    const assignment = await this.prisma.tenantCommercialAssignment.findUnique({
      where: { tenantId: tenant.id },
    });

    if (!assignment || assignment.managerId !== managerAccountId) {
      throw new AppError({
        code: 'COMMERCIAL_TENANT_ACCESS_DENIED',
        message: 'Você não tem acesso a este cliente',
        statusCode: 403,
      });
    }

    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId: tenant.id,
        status: 'ACTIVE',
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription || !subscription.plan) {
      return {
        tenant: {
          publicId: tenant.publicId,
          name: tenant.displayName,
        },
        plan: null,
        amountCents: 0,
        availableBalanceCents: 0,
        balanceAfterCents: 0,
        canPay: false,
        subscriptionStatus: 'NO_SUBSCRIPTION',
        nextPeriod: null,
      };
    }

    const balance = await this.walletService.getBalance(managerAccountId);
    const amountCents = subscription.plan.priceCents;
    const balanceAfter = Number(balance) - Number(amountCents);

    return {
      tenant: {
        publicId: tenant.publicId,
        name: tenant.displayName,
      },
      plan: {
        publicId: subscription.plan.publicId,
        name: subscription.plan.name,
        priceInCents: subscription.plan.priceCents,
      },
      amountCents: Number(amountCents),
      availableBalanceCents: Number(balance),
      balanceAfterCents: Math.max(0, balanceAfter),
      canPay: balance >= BigInt(amountCents),
      subscriptionStatus: subscription.status,
      nextPeriod: {
        start: subscription.currentPeriodStartsAt,
        end: subscription.currentPeriodEndsAt,
      },
    };
  }

  /**
   * Reverse a manual payment (admin only)
   */
  async reversePayment(paymentPublicId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.commercialManualPayment.findUnique({
        where: { publicId: paymentPublicId },
        include: {
          subscription: { include: { plan: true } },
          tenant: true,
          managerAccount: true,
        },
      });

      if (!payment) {
        throw new AppError({
          code: 'COMMERCIAL_PAYMENT_NOT_FOUND',
          message: 'Pagamento não encontrado',
          statusCode: 404,
        });
      }

      if (payment.status === 'REVERSED') return { paymentPublicId: payment.publicId, status: payment.status, reversedAt: payment.processedAt };

      // Reverse the original financial direction, retaining an immutable trail.
      if (payment.receiverType === 'REPRESENTATIVE') {
        await tx.commercialWalletEntry.create({ data: { publicId: randomUUID(), commercialAccountId: payment.managerAccountId, type: 'REVERSAL', amountCents: payment.amountCents, tenantId: payment.tenantId, subscriptionId: payment.subscriptionId, description: `Reversão TENANT_PAYMENT_COLLECTED:${payment.publicId}: ${reason}` } });
      } else {
        await tx.platformLedgerEntry.create({ data: { publicId: randomUUID(), tenantId: payment.tenantId, subscriptionId: payment.subscriptionId, manualPaymentId: payment.id, amountCents: -payment.amountCents, currency: payment.currency, type: 'SUBSCRIPTION_PAYMENT_REVERSAL', description: `Reversão do pagamento da plataforma:${payment.publicId}: ${reason}` } });
      }

      // 2. Revert subscription status
      await tx.tenantSubscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'PAST_DUE',
          lastPaymentAt: null,
        },
      });

      // 3. Reverse commissions created from this payment
      const commissions = await tx.commercialCommission.findMany({
        where: {
          subscriptionId: payment.subscriptionId,
          paymentId: payment.publicId,
          status: 'AVAILABLE',
        },
      });

      for (const commission of commissions) {
        // Create reversal entry for each commission
        await tx.commercialWalletEntry.create({
          data: {
            publicId: randomUUID(),
            commercialAccountId: commission.commercialAccountId,
            type: 'REVERSAL',
            amountCents: -BigInt(commission.commissionAmountCents),
            tenantId: commission.tenantId,
            subscriptionId: commission.subscriptionId,
            commissionId: commission.id,
            description: `Reversão de comissão: ${reason}`,
          },
        });

        // Mark commission as reversed
        await tx.commercialCommission.update({
          where: { id: commission.id },
          data: {
            status: 'REVERSED',
            reversedAt: new Date(),
          },
        });
      }

      // 4. Mark manual payment as reversed
      const updatedPayment = await tx.commercialManualPayment.update({
        where: { id: payment.id },
        data: {
          status: 'REVERSED',
        },
      });

      return {
        paymentPublicId: updatedPayment.publicId,
        status: updatedPayment.status,
        reversedAt: updatedPayment.processedAt,
      };
    });
  }

  private buildPaymentResponse(payment: any) {
    return {
      publicId: payment.publicId,
      tenantId: payment.tenantId,
      subscriptionId: payment.subscriptionId,
      managerAccountId: payment.managerAccountId,
      amountCents: Number(payment.amountCents),
      status: payment.status,
      processedAt: payment.processedAt,
      createdAt: payment.createdAt,
    };
  }
}
