import { type PrismaClient } from '../../database-client/client.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipUsageRepository } from './customer-membership-usage.repository.js';

export enum ChargeSource {
  MEMBERSHIP_INCLUDED = 'MEMBERSHIP_INCLUDED',
  MEMBERSHIP_DISCOUNT = 'MEMBERSHIP_DISCOUNT',
  SERVICE_PRICE = 'SERVICE_PRICE',
}

export enum BenefitType {
  QUANTITY = 'QUANTITY',
  UNLIMITED = 'UNLIMITED',
  DISCOUNT = 'DISCOUNT',
}

export interface BenefitResolution {
  covered: boolean;
  type: BenefitType | null;
  chargeSource: ChargeSource;
  referencePriceCents: bigint;
  amountDueCents: bigint;
  discountPercent?: number;
  limit?: number;
  reserved?: number;
  consumed?: number;
  released?: number;
  available?: number;
  cycleEnd?: Date;
  membershipChargeId?: bigint;
}

export class CustomerMembershipBenefitResolver {
  private readonly membershipRepository: CustomerMembershipRepository;
  private readonly chargeRepository: CustomerMembershipChargeRepository;
  private readonly usageRepository: CustomerMembershipUsageRepository;

  public constructor(client: PrismaClient) {
    this.membershipRepository = new CustomerMembershipRepository(client);
    this.chargeRepository = new CustomerMembershipChargeRepository(client);
    this.usageRepository = new CustomerMembershipUsageRepository(client);
  }

  public async resolveBenefit(
    tenantId: bigint,
    customerId: bigint,
    serviceId: bigint,
    referencePriceCents: bigint,
  ): Promise<BenefitResolution> {
    // Find active membership
    const membership = await this.membershipRepository.findByCustomer(tenantId, customerId);

    // No membership or not active
    if (!membership || membership.status !== 'ACTIVE') {
      return {
        covered: false,
        type: null,
        chargeSource: ChargeSource.SERVICE_PRICE,
        referencePriceCents,
        amountDueCents: referencePriceCents,
      };
    }

    // Find paid charge for current cycle
    const now = new Date();
    const charge = await this.chargeRepository.findCurrentPaid(tenantId, membership.id, now);

    if (!charge) {
      return {
        covered: false,
        type: null,
        chargeSource: ChargeSource.SERVICE_PRICE,
        referencePriceCents,
        amountDueCents: referencePriceCents,
      };
    }

    // Parse snapshot
    const snapshot =
      typeof charge.planSnapshot === 'string'
        ? JSON.parse(charge.planSnapshot)
        : charge.planSnapshot;

    if (!snapshot || !Array.isArray(snapshot.benefits)) {
      return {
        covered: false,
        type: null,
        chargeSource: ChargeSource.SERVICE_PRICE,
        referencePriceCents,
        amountDueCents: referencePriceCents,
      };
    }

    // Find benefit for this service in snapshot
    const benefit = snapshot.benefits.find(
      (b: any) => b.serviceId !== undefined && BigInt(String(b.serviceId)) === serviceId,
    );

    if (!benefit) {
      return {
        covered: false,
        type: null,
        chargeSource: ChargeSource.SERVICE_PRICE,
        referencePriceCents,
        amountDueCents: referencePriceCents,
      };
    }

    const benefitType = benefit.type as BenefitType;

    // Handle UNLIMITED
    if (benefitType === BenefitType.UNLIMITED) {
      return {
        covered: true,
        type: BenefitType.UNLIMITED,
        chargeSource: ChargeSource.MEMBERSHIP_INCLUDED,
        referencePriceCents,
        amountDueCents: 0n,
        cycleEnd: charge.periodEnd,
        membershipChargeId: charge.id,
      };
    }

    // Handle DISCOUNT
    if (benefitType === BenefitType.DISCOUNT) {
      const discountPercent = benefit.discountPercent ?? 0;
      const discountCents = (referencePriceCents * BigInt(discountPercent)) / 100n;
      const amountDueCents = referencePriceCents - discountCents;

      return {
        covered: true,
        type: BenefitType.DISCOUNT,
        chargeSource: ChargeSource.MEMBERSHIP_DISCOUNT,
        referencePriceCents,
        amountDueCents,
        discountPercent,
        cycleEnd: charge.periodEnd,
        membershipChargeId: charge.id,
      };
    }

    // Handle QUANTITY
    if (benefitType === BenefitType.QUANTITY) {
      const limit = benefit.quantityPerCycle ?? 0;
      const usage = await this.usageRepository.countByChargeAndService(charge.id, serviceId);

      const consumed = usage.consumed;
      const reserved = usage.reserved;
      const released = usage.released;
      const available = Math.max(0, limit - reserved - consumed);

      if (available > 0) {
        return {
          covered: true,
          type: BenefitType.QUANTITY,
          chargeSource: ChargeSource.MEMBERSHIP_INCLUDED,
          referencePriceCents,
          amountDueCents: 0n,
          limit,
          reserved,
          consumed,
          released,
          available,
          cycleEnd: charge.periodEnd,
          membershipChargeId: charge.id,
        };
      }

      // Saldo esgotado - fallback para SERVICE_PRICE
      return {
        covered: false,
        type: BenefitType.QUANTITY,
        chargeSource: ChargeSource.SERVICE_PRICE,
        referencePriceCents,
        amountDueCents: referencePriceCents,
        limit,
        reserved,
        consumed,
        released,
        available: 0,
        cycleEnd: charge.periodEnd,
        membershipChargeId: charge.id,
      };
    }

    return {
      covered: false,
      type: null,
      chargeSource: ChargeSource.SERVICE_PRICE,
      referencePriceCents,
      amountDueCents: referencePriceCents,
    };
  }
}
