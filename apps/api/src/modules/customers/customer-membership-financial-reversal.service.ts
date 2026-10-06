import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

export type MembershipFinancialReversalType = 'REFUND' | 'CHARGEBACK';

export interface ReconcileMembershipFinancialReversalInput {
  tenantId: bigint;
  paymentGatewayChargeId: bigint;
  type: MembershipFinancialReversalType;
  amountCents: bigint;
  effectiveAt: Date;
  provider: string;
  externalReference: string | null;
  idempotencyKey: string;
  actor?: { userId: bigint | null; sessionId: bigint | null };
}

export interface MembershipFinancialReversalResult {
  created: boolean;
  partialUnsupported: boolean;
  membershipChargePublicId: string | null;
  reversalPublicId: string | null;
}

function reversalAction(type: MembershipFinancialReversalType) {
  return type === 'CHARGEBACK'
    ? 'customer_membership_charge.charged_back'
    : 'customer_membership_charge.refunded';
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') ||
    (error instanceof Error && error.message.includes('Record has changed since last read'))
  );
}

/**
 * Reconciles an externally confirmed total refund/chargeback without mutating the
 * original Payment. The gateway charge is locked so different webhook identities for
 * the same financial operation converge on one reversal.
 */
export class CustomerMembershipFinancialReversalService {
  public constructor(private readonly client: PrismaClient) {}

  public async reconcile(
    input: ReconcileMembershipFinancialReversalInput,
  ): Promise<MembershipFinancialReversalResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction((tx) => this.reconcileWithinTransaction(tx, input), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!isRetryableTransactionConflict(error) || attempt === 2) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, (attempt + 1) * 10));
      }
    }
    throw new Error('Unreachable transaction retry state');
  }

  public async attachPayment(
    tenantId: bigint,
    paymentGatewayChargeId: bigint,
    paymentId: bigint,
  ): Promise<void> {
    await this.client.customerMembershipFinancialReversal.updateMany({
      where: {
        tenantId,
        paymentGatewayChargeId,
        paymentId: null,
      },
      data: { paymentId },
    });
  }

  private async reconcileWithinTransaction(
    tx: Prisma.TransactionClient,
    input: ReconcileMembershipFinancialReversalInput,
  ): Promise<MembershipFinancialReversalResult> {
    const lockedGatewayRows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id
      FROM payment_gateway_charges
      WHERE tenant_id = ${input.tenantId} AND id = ${input.paymentGatewayChargeId}
      FOR UPDATE
    `);
    if (lockedGatewayRows.length === 0)
      throw new AppError({
        code: 'PAYMENT_GATEWAY_CHARGE_NOT_FOUND',
        message: 'Cobrança gateway não encontrada para reconciliação.',
        statusCode: 404,
      });

    const gatewayCharge = await tx.paymentGatewayCharge.findFirst({
      where: { tenantId: input.tenantId, id: input.paymentGatewayChargeId },
      select: {
        id: true,
        publicId: true,
        originType: true,
        membershipChargeId: true,
        paymentId: true,
        amountCents: true,
      },
    });
    if (gatewayCharge === null)
      throw new AppError({
        code: 'PAYMENT_GATEWAY_CHARGE_NOT_FOUND',
        message: 'Cobrança gateway não encontrada para reconciliação.',
        statusCode: 404,
      });
    if (
      gatewayCharge.originType !== 'MEMBERSHIP_CHARGE' ||
      gatewayCharge.membershipChargeId === null
    )
      return {
        created: false,
        partialUnsupported: false,
        membershipChargePublicId: null,
        reversalPublicId: null,
      };

    const lockedMembershipChargeRows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id
      FROM customer_membership_charges
      WHERE tenant_id = ${input.tenantId} AND id = ${gatewayCharge.membershipChargeId}
      FOR UPDATE
    `);
    if (lockedMembershipChargeRows.length === 0)
      throw new AppError({
        code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_FOUND',
        message: 'Cobrança Membership não encontrada para reconciliação.',
        statusCode: 404,
      });

    const membershipCharge = await tx.customerMembershipCharge.findFirst({
      where: { tenantId: input.tenantId, id: gatewayCharge.membershipChargeId },
      include: { membership: true },
    });
    if (membershipCharge === null)
      throw new AppError({
        code: 'CUSTOMER_MEMBERSHIP_CHARGE_NOT_FOUND',
        message: 'Cobrança Membership não encontrada para reconciliação.',
        statusCode: 404,
      });

    const payment =
      gatewayCharge.paymentId === null
        ? await tx.payment.findFirst({
            where: {
              tenantId: input.tenantId,
              membershipChargeId: membershipCharge.id,
              originType: 'MEMBERSHIP_CHARGE',
              status: 'PAID',
            },
            orderBy: { paidAt: 'asc' },
            select: { id: true, amountCents: true },
          })
        : await tx.payment.findFirst({
            where: {
              tenantId: input.tenantId,
              id: gatewayCharge.paymentId,
              membershipChargeId: membershipCharge.id,
              originType: 'MEMBERSHIP_CHARGE',
              status: 'PAID',
            },
            select: { id: true, amountCents: true },
          });

    const expectedAmountCents = payment?.amountCents ?? membershipCharge.amountCents;
    if (
      input.amountCents !== expectedAmountCents ||
      input.amountCents !== gatewayCharge.amountCents
    ) {
      await tx.auditLog.create({
        data: {
          publicId: randomUUID(),
          tenantId: input.tenantId,
          userId: input.actor?.userId ?? null,
          sessionId: input.actor?.sessionId ?? null,
          action: 'customer_membership_charge.unsupported_partial_refund',
          targetType: 'customer_membership_charge',
          targetPublicId: membershipCharge.publicId,
          metadata: {
            reversalType: input.type,
            amountCents: input.amountCents.toString(),
            expectedAmountCents: expectedAmountCents.toString(),
            gatewayAmountCents: gatewayCharge.amountCents.toString(),
            provider: input.provider,
            externalReference: input.externalReference,
          },
        },
      });
      return {
        created: false,
        partialUnsupported: true,
        membershipChargePublicId: membershipCharge.publicId,
        reversalPublicId: null,
      };
    }

    const existingReversal = await tx.customerMembershipFinancialReversal.findFirst({
      where: { tenantId: input.tenantId, membershipChargeId: membershipCharge.id },
      orderBy: { createdAt: 'asc' },
    });
    if (existingReversal !== null) {
      if (existingReversal.paymentId === null && payment !== null)
        await tx.customerMembershipFinancialReversal.update({
          where: { id: existingReversal.id },
          data: { paymentId: payment.id },
        });
      if (membershipCharge.status !== 'REFUNDED')
        await tx.customerMembershipCharge.update({
          where: { id: membershipCharge.id },
          data: { status: 'REFUNDED' },
        });
      return {
        created: false,
        partialUnsupported: false,
        membershipChargePublicId: membershipCharge.publicId,
        reversalPublicId: existingReversal.publicId,
      };
    }

    const reversal = await tx.customerMembershipFinancialReversal.create({
      data: {
        publicId: randomUUID(),
        tenantId: input.tenantId,
        membershipChargeId: membershipCharge.id,
        paymentId: payment?.id ?? null,
        paymentGatewayChargeId: gatewayCharge.id,
        type: input.type,
        amountCents: input.amountCents,
        effectiveAt: input.effectiveAt,
        provider: input.provider,
        externalReference: input.externalReference,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.customerMembershipCharge.update({
      where: { id: membershipCharge.id },
      data: { status: 'REFUNDED' },
    });

    const now = new Date();
    const currentPaidCharge = await tx.customerMembershipCharge.findFirst({
      where: {
        tenantId: input.tenantId,
        membershipId: membershipCharge.membershipId,
        status: 'PAID',
        periodStart: { lte: now },
        periodEnd: { gt: now },
      },
      select: { id: true },
    });
    if (currentPaidCharge === null && membershipCharge.membership.status === 'ACTIVE') {
      await tx.customerMembership.update({
        where: { id: membershipCharge.membershipId },
        data: { status: 'PAST_DUE' },
      });
    }

    await tx.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId: input.tenantId,
        userId: input.actor?.userId ?? null,
        sessionId: input.actor?.sessionId ?? null,
        action: reversalAction(input.type),
        targetType: 'customer_membership_charge',
        targetPublicId: membershipCharge.publicId,
        metadata: {
          reversalPublicId: reversal.publicId,
          membershipPublicId: membershipCharge.membership.publicId,
          paymentPublicId: payment?.id.toString() ?? null,
          gatewayChargePublicId: gatewayCharge.publicId,
          amountCents: input.amountCents.toString(),
          effectiveAt: input.effectiveAt.toISOString(),
          provider: input.provider,
          externalReference: input.externalReference,
        },
      },
    });

    return {
      created: true,
      partialUnsupported: false,
      membershipChargePublicId: membershipCharge.publicId,
      reversalPublicId: reversal.publicId,
    };
  }
}
