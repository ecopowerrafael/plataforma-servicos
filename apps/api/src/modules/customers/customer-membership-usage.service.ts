import { randomUUID } from 'node:crypto';
import {
  type CustomerMembershipUsageStatus,
  type PrismaClient,
} from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipUsageRepository } from './customer-membership-usage.repository.js';
import { assertCustomerMembershipFeatureEnabled } from './customer-membership-feature-gate.js';

export class CustomerMembershipUsageService {
  private readonly repository: CustomerMembershipUsageRepository;

  public constructor(private readonly client: PrismaClient) {
    this.repository = new CustomerMembershipUsageRepository(client);
  }

  /**
   * Reserve within an existing Prisma transaction.
   * Returns Usage if successful, null if no saldo available.
   * For use in atomic Appointment + Usage creation flows.
   */
  public async reserveWithinTransaction(
    tx: any, // PrismaClient in transaction context
    data: {
      tenantId: bigint;
      membershipId: bigint;
      membershipChargeId: bigint;
      appointmentId: bigint;
      serviceId: bigint;
      quantity: number;
      quantityLimit?: number;
    },
  ): Promise<any | null> {
    await assertCustomerMembershipFeatureEnabled(tx, data.tenantId);
    // Check if already reserved (idempotent)
    const existing = await tx.customerMembershipUsage.findFirst({
      where: {
        membershipChargeId: data.membershipChargeId,
        appointmentId: data.appointmentId,
        serviceId: data.serviceId,
        status: 'RESERVED',
      },
    });

    if (existing) {
      return existing;
    }

    // Lock the charge row with FOR UPDATE to serialize reserves
    const chargeResult = await tx.$queryRaw`
      SELECT id, membership_id
      FROM customer_membership_charges
      WHERE id = ${data.membershipChargeId}
      FOR UPDATE
    `;

    if (!chargeResult || (Array.isArray(chargeResult) && chargeResult.length === 0)) {
      throw new AppError({
        code: 'MEMBERSHIP_CHARGE_NOT_FOUND',
        message: 'Cobrança não encontrada.',
        statusCode: 404,
      });
    }

    // For QUANTITY benefits: check if saldo available
    if (data.quantityLimit !== null && data.quantityLimit !== undefined) {
      const usage = await tx.customerMembershipUsage.groupBy({
        by: ['status'],
        where: {
          membershipChargeId: data.membershipChargeId,
          serviceId: data.serviceId,
          status: { in: ['RESERVED', 'CONSUMED'] },
        },
        _count: true,
      });

      const consumed = usage.find((r: any) => r.status === 'CONSUMED')?._count ?? 0;
      const reserved = usage.find((r: any) => r.status === 'RESERVED')?._count ?? 0;
      const available = Math.max(0, data.quantityLimit - reserved - consumed);

      // No saldo - return null, let caller fallback to SERVICE_PRICE
      if (available < data.quantity) {
        return null;
      }
    }

    // Create usage atomically
    return tx.customerMembershipUsage.create({
      data: {
        publicId: randomUUID(),
        tenantId: data.tenantId,
        membershipId: data.membershipId,
        membershipChargeId: data.membershipChargeId,
        appointmentId: data.appointmentId,
        serviceId: data.serviceId,
        quantity: data.quantity,
        status: 'RESERVED',
      },
    });
  }

  /**
   * Atomically reserve benefit with SELECT FOR UPDATE lock.
   * Returns existing usage if already reserved for this appointment/service/charge.
   * For QUANTITY benefits: only succeeds if saldo available.
   * Returns null if no saldo (caller must fallback to SERVICE_PRICE).
   */
  public async reserve(data: {
    tenantId: bigint;
    membershipId: bigint;
    membershipChargeId: bigint;
    appointmentId: bigint;
    serviceId: bigint;
    quantity: number;
    quantityLimit?: number;
  }): Promise<any | null> {
    await assertCustomerMembershipFeatureEnabled(this.client, data.tenantId);
    // Check if already reserved (idempotent)
    const existing = await this.repository.findForTransition(
      data.membershipChargeId,
      data.appointmentId,
      data.serviceId,
    );

    if (existing) {
      return existing;
    }

    // Transactional reserve with SELECT FOR UPDATE lock on charge
    return this.client.$transaction(async (tx) => {
      // Lock the charge row with FOR UPDATE to serialize reserves
      const chargeResult = await tx.$queryRaw`
        SELECT id, membership_id
        FROM customer_membership_charges
        WHERE id = ${data.membershipChargeId}
        FOR UPDATE
      `;

      if (!chargeResult || (Array.isArray(chargeResult) && chargeResult.length === 0)) {
        throw new AppError({
          code: 'MEMBERSHIP_CHARGE_NOT_FOUND',
          message: 'Cobrança não encontrada.',
          statusCode: 404,
        });
      }

      // For QUANTITY benefits: check if saldo available
      if (data.quantityLimit !== null && data.quantityLimit !== undefined) {
        const usage = await tx.customerMembershipUsage.groupBy({
          by: ['status'],
          where: {
            membershipChargeId: data.membershipChargeId,
            serviceId: data.serviceId,
            status: { in: ['RESERVED', 'CONSUMED'] },
          },
          _count: true,
        });

        const consumed = usage.find((r) => r.status === 'CONSUMED')?._count ?? 0;
        const reserved = usage.find((r) => r.status === 'RESERVED')?._count ?? 0;
        const available = Math.max(0, data.quantityLimit - reserved - consumed);

        // No saldo - return null, let caller fallback to SERVICE_PRICE
        if (available < data.quantity) {
          return null;
        }
      }

      // Create usage atomically (UNIQUE constraint prevents duplicates)
      return tx.customerMembershipUsage.create({
        data: {
          publicId: randomUUID(),
          tenantId: data.tenantId,
          membershipId: data.membershipId,
          membershipChargeId: data.membershipChargeId,
          appointmentId: data.appointmentId,
          serviceId: data.serviceId,
          quantity: data.quantity,
          status: 'RESERVED',
        },
      });
    });
  }

  /**
   * Mark usage as CONSUMED when appointment is completed.
   * Idempotent: if already CONSUMED, no-op.
   */
  private async transitionReservedUsage(
    tenantId: bigint,
    usageId: bigint,
    targetStatus: Exclude<CustomerMembershipUsageStatus, 'RESERVED'>,
  ): Promise<void> {
    const updated = await this.client.customerMembershipUsage.updateMany({
      where: { id: usageId, tenantId, status: 'RESERVED' },
      data: { status: targetStatus },
    });
    if (updated.count === 1) return;

    const usage = await this.client.customerMembershipUsage.findUnique({
      where: { id: usageId },
      select: { tenantId: true, status: true },
    });
    if (usage === null) {
      throw new AppError({
        code: 'USAGE_NOT_FOUND',
        message: 'Uso não encontrado.',
        statusCode: 404,
      });
    }
    if (usage.tenantId !== tenantId) {
      throw new AppError({
        code: 'USAGE_TENANT_MISMATCH',
        message: 'O uso não pertence ao tenant informado.',
        statusCode: 403,
      });
    }
    if (usage.status === targetStatus) return;

    throw new AppError({
      code: 'USAGE_TRANSITION_CONFLICT',
      message: `Não é possível transicionar o uso de ${usage.status} para ${targetStatus}.`,
      statusCode: 409,
    });
  }

  public async consume(tenantId: bigint, usageId: bigint): Promise<void> {
    await this.transitionReservedUsage(tenantId, usageId, 'CONSUMED');
  }

  /**
   * Mark usage as RELEASED when appointment is canceled.
   * Idempotent: if already RELEASED, no-op.
   */
  public async release(tenantId: bigint, usageId: bigint): Promise<void> {
    await this.transitionReservedUsage(tenantId, usageId, 'RELEASED');
  }

  /**
   * Administrative reversal (audit trail remains).
   */
  public async reverse(usageId: bigint): Promise<void> {
    const usage = await this.client.customerMembershipUsage.findUnique({
      where: { id: usageId },
    });

    if (!usage) {
      throw new AppError({
        code: 'USAGE_NOT_FOUND',
        message: 'Uso não encontrado.',
        statusCode: 404,
      });
    }

    await this.repository.update(usageId, { status: 'REVERSED' });
  }
}
