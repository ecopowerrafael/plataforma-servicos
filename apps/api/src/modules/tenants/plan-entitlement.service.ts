import { type PlanLimitKey } from '@plataforma/shared';

import { type Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

type Transaction = Prisma.TransactionClient;
export type PlanFeatureKey = Extract<PlanLimitKey, `${string}.enabled`>;
type LimitKey =
  | 'units.max'
  | 'members.max'
  | 'professionals.max'
  | 'services.max'
  | 'monthly_appointments.max';

export class PlanEntitlementService {
  public async assertCanCreateUnit(transaction: Transaction, tenantId: bigint): Promise<void> {
    await this.assertLimit(transaction, tenantId, 'units.max', 'businessUnit');
  }

  public async assertCanCreateProfessional(transaction: Transaction, tenantId: bigint): Promise<void> {
    await this.assertLimit(transaction, tenantId, 'professionals.max', 'professional');
  }

  public async assertCanCreateService(transaction: Transaction, tenantId: bigint): Promise<void> {
    await this.assertLimit(transaction, tenantId, 'services.max', 'service');
  }

  public async assertCanAddMember(transaction: Transaction, tenantId: bigint): Promise<void> {
    await this.assertLimit(transaction, tenantId, 'members.max', 'tenantMembership');
  }

  public async assertCanCreateAppointment(transaction: Transaction, tenantId: bigint): Promise<void> {
    await this.assertLimit(transaction, tenantId, 'monthly_appointments.max', 'appointment');
  }

  public async assertFeatureEnabled(
    transaction: Transaction,
    tenantId: bigint,
    key: PlanFeatureKey,
  ): Promise<void> {
    await this.lockTenant(transaction, tenantId);
    const subscription = await transaction.tenantSubscription.findFirst({
      where: { tenantId, effectiveKey: 'EFFECTIVE' },
      include: { plan: { include: { limits: { where: { key } } } } },
    });
    if (subscription?.plan.limits[0]?.booleanValue === true) return;
    throw new AppError({
      code: 'PLAN_FEATURE_UNAVAILABLE',
      message: 'Este recurso não está disponível no seu plano.',
      statusCode: 403,
    });
  }

  public async assertFeatureEnabledForTenant(
    client: PrismaClient,
    tenantId: bigint,
    key: PlanFeatureKey,
  ): Promise<void> {
    const subscription = await client.tenantSubscription.findFirst({
      where: { tenantId, effectiveKey: 'EFFECTIVE' },
      include: { plan: { include: { limits: { where: { key } } } } },
    });
    if (subscription?.plan.limits[0]?.booleanValue === true) return;
    throw new AppError({ code: 'PLAN_FEATURE_UNAVAILABLE', message: 'Este recurso não está disponível no seu plano.', statusCode: 403 });
  }

  public async featureEnabledForTenant(
    client: PrismaClient,
    tenantId: bigint,
    key: PlanFeatureKey,
  ): Promise<boolean> {
    const subscription = await client.tenantSubscription.findFirst({
      where: { tenantId, effectiveKey: 'EFFECTIVE' },
      include: { plan: { include: { limits: { where: { key } } } } },
    });
    return subscription?.plan.limits[0]?.booleanValue === true;
  }

  private async assertLimit(
    transaction: Transaction,
    tenantId: bigint,
    key: LimitKey,
    model: 'businessUnit' | 'professional' | 'service' | 'tenantMembership' | 'appointment',
  ): Promise<void> {
    await this.lockTenant(transaction, tenantId);
    const subscription = await transaction.tenantSubscription.findFirst({
      where: { tenantId, effectiveKey: 'EFFECTIVE' },
      include: { plan: { include: { limits: { where: { key } } } } },
    });
    const limit = subscription?.plan.limits[0]?.integerValue;
    if (limit === undefined || limit === null) return;
    if (subscription === null) return;
    const usage =
      model === 'businessUnit'
        ? await transaction.businessUnit.count({ where: { tenantId, status: 'ACTIVE' } })
        : model === 'professional'
          ? await transaction.professional.count({ where: { tenantId, active: true } })
          : model === 'service'
            ? await transaction.service.count({ where: { tenantId, active: true } })
          : model === 'tenantMembership'
            ? await transaction.tenantMembership.count({ where: { tenantId, status: 'ACTIVE' } })
            : await transaction.appointment.count({
                where: {
                  tenantId,
                  createdAt: {
                    gte: subscription.currentPeriodStartsAt,
                    lte: subscription.currentPeriodEndsAt,
                  },
                },
              });
    if (BigInt(usage) < limit) return;
    const message = {
      'units.max': `Seu plano permite até ${limit.toString()} unidade${limit === 1n ? '' : 's'}.`,
      'professionals.max': `Seu plano permite até ${limit.toString()} profissionais.`,
      'members.max': `Seu plano permite até ${limit.toString()} membros da equipe.`,
      'services.max': `Seu plano permite atÃ© ${limit.toString()} serviÃ§os ativos.`,
      'monthly_appointments.max': 'O limite mensal de agendamentos do seu plano foi atingido.',
    }[key];
    throw new AppError({ code: 'PLAN_LIMIT_REACHED', message, statusCode: 409 });
  }

  private async lockTenant(transaction: Transaction, tenantId: bigint): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
  }
}
