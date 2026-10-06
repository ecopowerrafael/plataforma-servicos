import {
  type CustomerMembershipPaymentResponse,
  type PaymentGatewayChargeStatus,
} from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type PaymentGatewayService } from '../payments/gateway/payment-gateway.service.js';
import {
  getCustomerMembershipFeatureState,
  isCustomerMembershipFeatureEnabled,
} from './customer-membership-feature-gate.js';
import { selectCurrentMembership } from './customer-membership-account.service.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const OPERABLE_MEMBERSHIP_STATUSES = ['PENDING', 'PAST_DUE'] as const;
const USABLE_GATEWAY_STATUSES: PaymentGatewayChargeStatus[] = ['PENDING', 'PROCESSING'];

type PaymentMembership = Awaited<
  ReturnType<CustomerMembershipAccountPaymentService['listMemberships']>
>[number];

type PaymentCharge = PaymentMembership['charges'][number];

function membershipPaymentUnavailable() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_PAYMENT_UNAVAILABLE',
    message: 'Esta mensalidade não possui um pagamento disponível.',
    statusCode: 409,
  });
}

function membershipNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_NOT_FOUND',
    message: 'Mensalidade não encontrada.',
    statusCode: 404,
  });
}

export class CustomerMembershipAccountPaymentService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly paymentGateway: PaymentGatewayService | undefined,
  ) {}

  public async getForCustomer(
    tenantId: bigint,
    customerId: bigint,
    now = new Date(),
  ): Promise<CustomerMembershipPaymentResponse> {
    const membership = await this.currentMembership(tenantId, customerId);
    if (membership === undefined) throw membershipNotFound();

    const charge = this.selectOperableCharge(membership, now);
    const gateway = charge === undefined ? undefined : this.selectUsableGateway(charge);
    const featureState = await getCustomerMembershipFeatureState(this.client, tenantId);
    const canOperate = OPERABLE_MEMBERSHIP_STATUSES.includes(
      membership.status as (typeof OPERABLE_MEMBERSHIP_STATUSES)[number],
    );

    return this.serialize(
      membership,
      charge,
      gateway,
      canOperate && isCustomerMembershipFeatureEnabled(featureState),
    );
  }

  public async createOrReuse(
    tenantId: bigint,
    customerId: bigint,
    actor: Actor,
  ): Promise<CustomerMembershipPaymentResponse> {
    const membership = await this.currentMembership(tenantId, customerId);
    if (membership === undefined) throw membershipNotFound();
    if (
      !OPERABLE_MEMBERSHIP_STATUSES.includes(
        membership.status as (typeof OPERABLE_MEMBERSHIP_STATUSES)[number],
      )
    )
      throw membershipPaymentUnavailable();

    const charge = this.selectOperableCharge(membership, new Date());
    if (charge === undefined) throw membershipPaymentUnavailable();

    const existing = this.selectUsableGateway(charge);
    if (existing !== undefined) return this.getForCustomer(tenantId, customerId);
    if (this.paymentGateway === undefined)
      throw new AppError({
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'Nenhum gateway de pagamento está disponível.',
        statusCode: 409,
      });

    const provider = await this.paymentGateway.resolveActiveMembershipProvider(tenantId);
    if (provider === null)
      throw new AppError({
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'Nenhum gateway de pagamento ativo está configurado para este estabelecimento.',
        statusCode: 409,
      });

    await this.paymentGateway.createMembershipCharge(tenantId, charge.publicId, provider, actor);
    return this.getForCustomer(tenantId, customerId);
  }

  public async refresh(
    tenantId: bigint,
    customerId: bigint,
  ): Promise<CustomerMembershipPaymentResponse> {
    const membership = await this.currentMembership(tenantId, customerId);
    if (membership === undefined) throw membershipNotFound();
    const charge = this.selectOperableCharge(membership, new Date());
    const gateway = charge === undefined ? undefined : this.selectUsableGateway(charge);
    if (gateway === undefined || this.paymentGateway === undefined)
      throw membershipPaymentUnavailable();

    await this.paymentGateway.getCharge(tenantId, gateway.publicId, true);
    return this.getForCustomer(tenantId, customerId);
  }

  private async currentMembership(tenantId: bigint, customerId: bigint) {
    const memberships = await this.listMemberships(tenantId, customerId);
    return selectCurrentMembership(memberships);
  }

  private listMemberships(tenantId: bigint, customerId: bigint) {
    return this.client.customerMembership.findMany({
      where: {
        tenantId,
        customerId,
        status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] },
      },
      include: {
        charges: {
          where: { status: { in: ['PENDING', 'FAILED'] } },
          orderBy: { periodStart: 'asc' },
          include: {
            gatewayCharges: {
              where: {
                tenantId,
                originType: 'MEMBERSHIP_CHARGE',
                paymentId: null,
                supersededAt: null,
              },
              orderBy: { createdAt: 'desc' },
              select: {
                publicId: true,
                provider: true,
                status: true,
                amountCents: true,
                currency: true,
                pixCopyPaste: true,
                lastCheckedAt: true,
                canceledAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private selectOperableCharge(membership: PaymentMembership, now: Date) {
    if (
      !OPERABLE_MEMBERSHIP_STATUSES.includes(
        membership.status as (typeof OPERABLE_MEMBERSHIP_STATUSES)[number],
      )
    )
      return undefined;
    if (membership.status === 'PENDING') return membership.charges[0];

    const renewalCharge = membership.charges.find(
      (charge) =>
        membership.currentPeriodEnd !== null &&
        charge.periodStart.getTime() === membership.currentPeriodEnd.getTime(),
    );
    return (
      renewalCharge ??
      membership.charges
        .filter((charge) => charge.periodStart <= now)
        .sort((left, right) => right.periodStart.getTime() - left.periodStart.getTime())[0]
    );
  }

  private selectUsableGateway(charge: PaymentCharge) {
    return charge.gatewayCharges.find((gateway) =>
      USABLE_GATEWAY_STATUSES.includes(gateway.status as PaymentGatewayChargeStatus),
    );
  }

  private serialize(
    membership: PaymentMembership,
    charge: PaymentCharge | undefined,
    gateway: ReturnType<CustomerMembershipAccountPaymentService['selectUsableGateway']>,
    canGenerate: boolean,
  ): CustomerMembershipPaymentResponse {
    return {
      membershipStatus: membership.status,
      charge:
        charge === undefined
          ? null
          : {
              periodStart: charge.periodStart.toISOString(),
              periodEnd: charge.periodEnd.toISOString(),
              amountCents: Number(charge.amountCents),
              status: charge.status,
              dueAt: charge.dueAt.toISOString(),
              paidAt: charge.paidAt?.toISOString() ?? null,
            },
      gateway:
        gateway === undefined
          ? null
          : {
              provider: gateway.provider,
              status: gateway.status,
              amountCents: Number(gateway.amountCents),
              currency: gateway.currency,
              pixCopyPaste: gateway.pixCopyPaste,
              lastCheckedAt: gateway.lastCheckedAt?.toISOString() ?? null,
              canceledAt: gateway.canceledAt?.toISOString() ?? null,
            },
      canGenerateGatewayCharge: canGenerate,
      canRefreshGatewayCharge: gateway !== undefined,
    };
  }
}
