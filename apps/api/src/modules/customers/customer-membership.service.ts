import { randomUUID } from 'node:crypto';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipRepository } from './customer-membership.repository.js';
import { CustomerMembershipChargeRepository } from './customer-membership-charge.repository.js';
import { CustomerMembershipChargeService } from './customer-membership-charge.service.js';
import { addMembershipPeriod, membershipAnchorDay } from './customer-membership-period.js';
import { assertCustomerMembershipFeatureEnabled } from './customer-membership-feature-gate.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

interface MembershipGatewayCancellation {
  cancelPendingMembershipCharges(
    tenantId: bigint,
    chargeIds: bigint[],
    actor: Actor,
  ): Promise<void>;
}

function planNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_PLAN_NOT_FOUND',
    message: 'Plano de assinatura não encontrado.',
    statusCode: 404,
  });
}

function customerNotFound() {
  return new AppError({
    code: 'CUSTOMER_NOT_FOUND',
    message: 'Cliente não encontrado.',
    statusCode: 404,
  });
}

function membershipExists() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_EXISTS',
    message: 'Cliente já possui uma assinatura ativa neste tenant.',
    statusCode: 409,
  });
}

function membershipNotFoundErr() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_NOT_FOUND',
    message: 'Assinatura não encontrada.',
    statusCode: 404,
  });
}

export class CustomerMembershipService {
  public constructor(
    private readonly repository: CustomerMembershipRepository,
    private readonly chargeService?: CustomerMembershipChargeService,
    private readonly gatewayCancellation?: MembershipGatewayCancellation,
  ) {}

  public async cancel(tenantId: bigint, publicId: string, actor: Actor, reason?: string) {
    const pendingGatewayChargeIds = await this.repository.client.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM customer_memberships WHERE tenant_id = ${tenantId} AND public_id = ${publicId} FOR UPDATE
      `;
        if (locked.length === 0) throw membershipNotFoundErr();
        const membership = await tx.customerMembership.findFirst({
          where: { tenantId, publicId },
          select: { id: true, status: true },
        });
        if (membership === null) throw membershipNotFoundErr();
        if (membership.status === 'CANCELED' || membership.status === 'EXPIRED') return [];

        const openAppointments = await tx.appointment.count({
          where: {
            tenantId,
            membershipUsages: { some: { membershipId: membership.id } },
            status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
            chargeSource: { in: ['MEMBERSHIP_INCLUDED', 'MEMBERSHIP_DISCOUNT'] },
          },
        });
        if (openAppointments > 0)
          throw new AppError({
            code: 'OPEN_MEMBERSHIP_APPOINTMENTS',
            message: `Existem ${openAppointments} agendamentos futuros usando benefícios desta mensalidade.`,
            statusCode: 409,
          });

        const reservedUsage = await tx.customerMembershipUsage.count({
          where: { tenantId, membershipId: membership.id, status: 'RESERVED' },
        });
        if (reservedUsage > 0)
          throw new AppError({
            code: 'RESERVED_MEMBERSHIP_USAGE',
            message: `Existem ${reservedUsage} usos reservados nesta mensalidade.`,
            statusCode: 409,
          });

        const paidUnreconciled = await tx.paymentGatewayCharge.count({
          where: {
            tenantId,
            membershipCharge: { membershipId: membership.id },
            originType: 'MEMBERSHIP_CHARGE',
            status: 'PAID',
            paymentId: null,
          },
        });
        if (paidUnreconciled > 0)
          throw new AppError({
            code: 'PAID_GATEWAY_CHARGE_UNRECONCILED',
            message: `Existem ${paidUnreconciled} cobranças gateway pagas sem reconciliação local.`,
            statusCode: 409,
          });

        await tx.customerMembershipCharge.updateMany({
          where: { tenantId, membershipId: membership.id, status: 'PENDING' },
          data: { status: 'CANCELED' },
        });
        const gatewayCharges = await tx.paymentGatewayCharge.findMany({
          where: {
            tenantId,
            membershipCharge: { membershipId: membership.id },
            originType: 'MEMBERSHIP_CHARGE',
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          select: { id: true },
        });
        await tx.customerMembership.update({
          where: { id: membership.id },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
            cancelAtPeriodEnd: false,
            nextBillingAt: null,
          },
        });
        await tx.auditLog.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            userId: actor.userId,
            sessionId: actor.sessionId,
            action: 'customer_membership.canceled',
            targetType: 'customer_membership',
            targetPublicId: publicId,
            metadata: {
              fromStatus: membership.status,
              toStatus: 'CANCELED',
              effectiveAt: new Date().toISOString(),
              ...(reason === undefined ? {} : { reason: reason.slice(0, 500) }),
            },
          },
        });
        return gatewayCharges.map((charge) => charge.id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (pendingGatewayChargeIds.length > 0 && this.gatewayCancellation !== undefined)
      await this.gatewayCancellation.cancelPendingMembershipCharges(
        tenantId,
        pendingGatewayChargeIds,
        actor,
      );
    return this.repository.find(tenantId, publicId);
  }

  public async scheduleCancelAtPeriodEnd(tenantId: bigint, publicId: string, actor: Actor) {
    return this.setCancelAtPeriodEnd(tenantId, publicId, true, actor);
  }

  public async revokeCancelAtPeriodEnd(tenantId: bigint, publicId: string, actor: Actor) {
    return this.setCancelAtPeriodEnd(tenantId, publicId, false, actor);
  }

  private async setCancelAtPeriodEnd(
    tenantId: bigint,
    publicId: string,
    value: boolean,
    actor: Actor,
  ) {
    return this.repository.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_memberships WHERE tenant_id = ${tenantId} AND public_id = ${publicId} FOR UPDATE`;
      const membership = await tx.customerMembership.findFirst({ where: { tenantId, publicId } });
      if (membership === null) throw membershipNotFoundErr();
      if (['CANCELED', 'EXPIRED'].includes(membership.status)) {
        if (!value)
          throw new AppError({
            code: 'CUSTOMER_MEMBERSHIP_NOT_REOPENABLE',
            message: 'A mensalidade encerrada não pode ser reaberta.',
            statusCode: 409,
          });
        return membership;
      }
      if (membership.cancelAtPeriodEnd === value) return membership;
      const updated = await tx.customerMembership.update({
        where: { id: membership.id },
        data: { cancelAtPeriodEnd: value },
      });
      await tx.auditLog.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          userId: actor.userId,
          sessionId: actor.sessionId,
          action: value
            ? 'customer_membership.cancel_scheduled'
            : 'customer_membership.cancel_schedule_revoked',
          targetType: 'customer_membership',
          targetPublicId: publicId,
        },
      });
      return updated;
    });
  }

  public async create(tenantId: bigint, customerId: string, planPublicId: string, actor: Actor) {
    return this.repository.withTenantLock(tenantId, async (repository) => {
      const chargeService =
        this.chargeService === undefined
          ? undefined
          : new CustomerMembershipChargeService(
              new CustomerMembershipChargeRepository(repository.client),
            );
      return this.createLocked(
        repository,
        chargeService,
        tenantId,
        customerId,
        planPublicId,
        actor,
      );
    });
  }

  private async createLocked(
    repository: CustomerMembershipRepository,
    chargeService: CustomerMembershipChargeService | undefined,
    tenantId: bigint,
    customerId: string,
    planPublicId: string,
    actor: Actor,
  ) {
    const tenant = await repository.findOperatingModel(tenantId);
    await assertCustomerMembershipFeatureEnabled(repository.client, tenantId);
    if (tenant === null) throw customerNotFound();

    const plan = await this.repository.findPlan(tenantId, planPublicId);
    if (plan === null) throw planNotFound();

    const customer = await this.repository.findCustomer(tenantId, customerId);
    if (customer === null) throw customerNotFound();

    const existing = await this.repository.findByCustomer(tenantId, customer.id);
    if (existing !== null) throw membershipExists();

    try {
      const publicId = randomUUID();
      const activeKey = `${tenantId}:${customer.id}`;
      const item = await this.repository.create({
        publicId,
        tenantId,
        customerId: customer.id,
        planId: plan.id,
        status: 'PENDING',
        activeKey,
        startedAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextBillingAt: null,
        cancelAtPeriodEnd: false,
      });

      // Generate FIRST charge immediately (status PENDING, awaiting payment)
      if (chargeService && plan.priceCents > 0n) {
        const now = new Date();
        const periodEnd = addMembershipPeriod(
          now,
          plan.billingInterval,
          tenant.timezone,
          membershipAnchorDay(now, tenant.timezone),
        );

        // Capture immutable plan configuration for this charge/cycle. BigInt
        // identifiers are serialized as decimal strings to avoid precision loss.
        const planSnapshot = {
          planPublicId: plan.publicId,
          planName: plan.name,
          priceCents: Number(plan.priceCents),
          billingInterval: plan.billingInterval,
          benefits: plan.benefits.map((b) => ({
            serviceId: b.serviceId.toString(),
            type: b.type,
            quantityPerCycle: b.quantityPerCycle,
            discountPercent: b.discountPercent,
          })),
        };

        await chargeService.generateCharge(
          tenantId,
          item.id,
          now,
          periodEnd,
          plan.priceCents,
          actor,
          planSnapshot,
        );
      }

      await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'create');
      return item;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_EXISTS',
          message: 'Cliente já possui uma assinatura ativa neste tenant.',
          statusCode: 409,
          cause: error,
        });
      throw error;
    }
  }

  public async getForCustomer(tenantId: bigint, customerId: bigint) {
    return this.repository.findByCustomer(tenantId, customerId);
  }

  public async activateMembership(
    membershipId: bigint,
    paidAt: Date,
    publicId: string,
    tenantId: bigint,
    actor: Actor,
  ) {
    const membership = await this.repository.findById(tenantId, membershipId);
    if (!membership) throw membershipNotFoundErr();

    const periodStart = paidAt;
    const periodEnd =
      membership.currentPeriodEnd ??
      addMembershipPeriod(
        periodStart,
        membership.plan.billingInterval,
        'UTC',
        membershipAnchorDay(periodStart, 'UTC'),
      );
    const nextBilling = periodEnd;

    const updated = await this.repository.update(tenantId, membershipId, {
      status: 'ACTIVE',
      startedAt: paidAt,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextBillingAt: nextBilling,
    });

    if (updated === null) throw membershipNotFoundErr();
    await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'activate');
    return updated;
  }
}
