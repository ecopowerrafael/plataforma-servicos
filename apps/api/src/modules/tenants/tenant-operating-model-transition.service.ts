import { randomUUID } from 'node:crypto';

import { OperatingModelSchema, type OperatingModel } from '@plataforma/shared';

import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

export interface TransitionBlocker {
  code: string;
  count: number;
}

export interface TransitionPreview {
  from: OperatingModel;
  to: OperatingModel;
  canTransition: boolean;
  blockers: TransitionBlocker[];
  warnings: TransitionBlocker[];
}

const OPEN_MEMBERSHIP_STATUSES = ['ACTIVE', 'PENDING', 'PAST_DUE', 'PAUSED'] as const;
const OPEN_APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;

function transitionBlocked(blockers: TransitionBlocker[]) {
  return new AppError({
    code: 'OPERATING_MODEL_TRANSITION_BLOCKED',
    message: 'A transição do modelo operacional possui pendências abertas.',
    statusCode: 409,
    cause: { blockers },
  });
}

export class TenantOperatingModelTransitionService {
  public constructor(private readonly client: PrismaClient) {}

  public async preview(tenantId: bigint, to: OperatingModel): Promise<TransitionPreview> {
    const tenant = await this.client.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { operatingModel: true, settings: { select: { membershipSalesEnabled: true } } },
    });
    const from = OperatingModelSchema.parse(tenant.operatingModel);
    return this.buildPreview(this.client, tenantId, from, to, tenant.settings?.membershipSalesEnabled ?? true);
  }

  public async transition(
    tenantId: bigint,
    to: OperatingModel,
    expectedFrom: OperatingModel | undefined,
    actor: { userId: bigint; sessionId: bigint },
  ) {
    return this.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: bigint; operating_model: OperatingModel }>>`
        SELECT id, operating_model FROM tenants WHERE id = ${tenantId} FOR UPDATE
      `;
      const current = locked[0];
      if (current === undefined) throw new AppError({ code: 'TENANT_NOT_FOUND', message: 'Estabelecimento não encontrado.', statusCode: 404 });
      const from = OperatingModelSchema.parse(current.operating_model);
      if (expectedFrom !== undefined && expectedFrom !== from)
        throw new AppError({ code: 'OPERATING_MODEL_STALE', message: 'O modelo operacional foi alterado antes desta confirmação.', statusCode: 409 });
      if (from === to)
        throw new AppError({ code: 'OPERATING_MODEL_ALREADY_ACTIVE', message: 'Este modelo operacional já está ativo.', statusCode: 409 });

      const settings = await tx.tenantSettings.findUnique({ where: { tenantId }, select: { membershipSalesEnabled: true } });
      const preview = await this.buildPreview(tx, tenantId, from, to, settings?.membershipSalesEnabled ?? true);
      if (!preview.canTransition) throw transitionBlocked(preview.blockers);

      const effectiveAt = new Date();
      const updated = await tx.tenant.update({ where: { id: tenantId }, data: { operatingModel: to }, select: { publicId: true, operatingModel: true } });
      await tx.tenantOperatingModelTransition.create({
        data: {
          publicId: randomUUID(), tenantId, fromModel: from, toModel: to, effectiveAt,
          createdByUserId: actor.userId, createdBySessionId: actor.sessionId,
        },
      });
      await tx.auditLog.create({
        data: {
          publicId: randomUUID(), tenantId, userId: actor.userId, sessionId: actor.sessionId,
          action: 'tenant.operating_model.changed', targetType: 'tenant', targetPublicId: updated.publicId,
          metadata: { from, to },
        },
      });
      return { from, to: updated.operatingModel, effectiveAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async buildPreview(
    client: PrismaClient | Prisma.TransactionClient,
    tenantId: bigint,
    from: OperatingModel,
    to: OperatingModel,
    membershipSalesEnabled: boolean,
  ): Promise<TransitionPreview> {
    const blockers: TransitionBlocker[] = [];
    const warnings: TransitionBlocker[] = [];
    if (from === 'SERVICE_PRICING' && to === 'MEMBERSHIP') {
      if (membershipSalesEnabled) {
        const count = await client.customerMembershipPlan.count({ where: { tenantId, active: true } });
        if (count === 0) blockers.push({ code: 'ACTIVE_MEMBERSHIP_PLAN_REQUIRED', count: 0 });
      } else {
        warnings.push({ code: 'MEMBERSHIP_SALES_DISABLED', count: 0 });
      }
    }
    if (from === 'MEMBERSHIP' && to === 'SERVICE_PRICING') {
      const [memberships, charges, gatewayCharges, usage, appointments] = await Promise.all([
        client.customerMembership.count({ where: { tenantId, status: { in: [...OPEN_MEMBERSHIP_STATUSES] } } }),
        client.customerMembershipCharge.count({ where: { tenantId, status: 'PENDING', membership: { status: { in: [...OPEN_MEMBERSHIP_STATUSES] } } } }),
        client.paymentGatewayCharge.count({ where: { tenantId, originType: 'MEMBERSHIP_CHARGE', status: { in: ['PENDING', 'PROCESSING'] }, supersededAt: null } }),
        client.customerMembershipUsage.count({ where: { tenantId, status: 'RESERVED' } }),
        client.appointment.count({ where: { tenantId, status: { in: [...OPEN_APPOINTMENT_STATUSES] }, chargeSource: { in: ['MEMBERSHIP_INCLUDED', 'MEMBERSHIP_DISCOUNT'] } } }),
      ]);
      if (memberships > 0) blockers.push({ code: 'OPEN_MEMBERSHIPS', count: memberships });
      if (charges > 0) blockers.push({ code: 'PENDING_MEMBERSHIP_CHARGES', count: charges });
      if (gatewayCharges > 0) blockers.push({ code: 'PENDING_MEMBERSHIP_GATEWAY_CHARGES', count: gatewayCharges });
      if (usage > 0) blockers.push({ code: 'RESERVED_MEMBERSHIP_USAGE', count: usage });
      if (appointments > 0) blockers.push({ code: 'OPEN_MEMBERSHIP_APPOINTMENTS', count: appointments });
    }
    return { from, to, canTransition: blockers.length === 0, blockers, warnings };
  }
}
