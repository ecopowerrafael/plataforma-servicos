import { randomUUID } from 'node:crypto';

import { CommissionListResponseSchema, CommissionRecordPublicSchema } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const include = {
  payment: { select: { publicId: true } },
  professional: { select: { publicId: true, name: true } },
  appointment: {
    select: {
      publicId: true,
      protocol: true,
      service: { select: { name: true } },
      comboNameSnapshot: true,
    },
  },
} as const;

interface CommissionWithRelations {
  publicId: string;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  ruleSource: 'OVERRIDE' | 'DEFAULT';
  baseAmountCents: bigint;
  commissionAmountCents: bigint;
  status: 'ACTIVE' | 'CANCELED';
  canceledAt: Date | null;
  canceledReason: string | null;
  createdAt: Date;
  payment: { publicId: string };
  professional: { publicId: string; name: string };
  appointment: { publicId: string; protocol: string; service: { name: string } | null; comboNameSnapshot: string | null };
}

const pub = (commission: CommissionWithRelations) => {
  const offeringName = commission.appointment.service?.name ?? commission.appointment.comboNameSnapshot ?? 'Oferta';
  return CommissionRecordPublicSchema.parse({
    publicId: commission.publicId,
    paymentPublicId: commission.payment.publicId,
    appointmentPublicId: commission.appointment.publicId,
    appointmentProtocol: commission.appointment.protocol,
    professionalPublicId: commission.professional.publicId,
    professionalName: commission.professional.name,
    serviceName: offeringName,
    commissionType: commission.commissionType,
    commissionValue: commission.commissionValue,
    ruleSource: commission.ruleSource,
    baseAmountCents: commission.baseAmountCents.toString(),
    commissionAmountCents: commission.commissionAmountCents.toString(),
    status: commission.status,
    canceledAt: commission.canceledAt?.toISOString() ?? null,
    canceledReason: commission.canceledReason,
    createdAt: commission.createdAt.toISOString(),
  });
};

export class ProfessionalCommissionService {
  public constructor(private readonly client: PrismaClient) {}
  private assertEnabled(tenantId: bigint) { return new PlanEntitlementService().assertFeatureEnabledForTenant(this.client, tenantId, 'commissions.enabled'); }

  /**
   * Calcula e registra, a partir do pagamento realmente recebido, um snapshot da regra de
   * comissão vigente naquele momento (override do vínculo profissional-serviço, senão o padrão
   * do profissional) — a regra usada fica congelada nesta linha e nunca é recalculada
   * retroativamente se a configuração mudar depois.
   */
  public async recordForPayment(
    tenantId: bigint,
    payment: { id: bigint; amountCents: bigint },
    appointment: { id: bigint; professionalId: bigint; serviceId: bigint | null },
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId);
    const [professional, override] = await Promise.all([
      this.client.professional.findFirst({
        where: { id: appointment.professionalId },
        select: { commissionType: true, commissionValue: true },
      }),
      appointment.serviceId !== null
        ? this.client.professionalService.findFirst({
            where: { professionalId: appointment.professionalId, serviceId: appointment.serviceId },
            select: { commissionType: true, commissionValue: true },
          })
        : Promise.resolve(null),
    ]);
    if (professional === null) return;

    const rule =
      appointment.serviceId !== null && override?.commissionType != null && override.commissionValue != null
        ? {
            type: override.commissionType,
            value: override.commissionValue,
            source: 'OVERRIDE' as const,
          }
        : {
            type: professional.commissionType,
            value: professional.commissionValue,
            source: 'DEFAULT' as const,
          };
    const commissionAmountCents =
      rule.type === 'PERCENTAGE'
        ? (payment.amountCents * BigInt(rule.value)) / 100n
        : BigInt(rule.value);

    const created = await this.client.professionalCommission.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        paymentId: payment.id,
        professionalId: appointment.professionalId,
        appointmentId: appointment.id,
        commissionType: rule.type,
        commissionValue: rule.value,
        ruleSource: rule.source,
        baseAmountCents: payment.amountCents,
        commissionAmountCents,
      },
      include,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'commission.generated',
        targetType: 'professional_commission',
        targetPublicId: created.publicId,
      },
    });
    return pub(created);
  }

  /** Estorna (cancela) a comissão vinculada a um pagamento cancelado, se houver uma ativa. */
  public async cancelForPayment(tenantId: bigint, paymentId: bigint, reason: string, actor: Actor) {
    const commission = await this.client.professionalCommission.findFirst({
      where: { tenantId, paymentId, status: 'ACTIVE' },
      select: { id: true, publicId: true },
    });
    if (commission === null) return;
    await this.client.professionalCommission.update({
      where: { id: commission.id },
      data: { status: 'CANCELED', canceledAt: new Date(), canceledReason: reason },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'commission.canceled',
        targetType: 'professional_commission',
        targetPublicId: commission.publicId,
      },
    });
  }

  /** Consulta administrativa das comissões geradas, opcionalmente filtrada por profissional e período. */
  public async list(
    tenantId: bigint,
    query: {
      professionalPublicId?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
    },
  ) {
    const items = await this.client.professionalCommission.findMany({
      where: {
        tenantId,
        ...(query.professionalPublicId === undefined
          ? {}
          : { professional: { publicId: query.professionalPublicId } }),
        ...(query.from === undefined && query.to === undefined
          ? {}
          : {
              createdAt: {
                ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
                ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
              },
            }),
      },
      orderBy: { createdAt: 'desc' },
      include,
    });
    return CommissionListResponseSchema.parse({ items: items.map(pub) });
  }

  /** Comissões geradas do próprio profissional (self-service, isolado por professionalId). */
  public async listForProfessional(
    tenantId: bigint,
    professionalId: bigint,
    query: { from?: string; to?: string } = {},
  ) {
    await this.assertEnabled(tenantId);
    const items = await this.client.professionalCommission.findMany({
      where: { tenantId, professionalId, ...(query.from === undefined && query.to === undefined ? {} : { createdAt: { ...(query.from === undefined ? {} : { gte: new Date(query.from) }), ...(query.to === undefined ? {} : { lt: new Date(query.to) }) } }) },
      orderBy: { createdAt: 'desc' },
      include,
    });
    return CommissionListResponseSchema.parse({ items: items.map(pub) });
  }
}
