import { randomUUID } from 'node:crypto';
import {
  type CreateCustomerMembershipPlanRequest,
  type UpdateCustomerMembershipPlanRequest,
  CustomerMembershipPlanListResponseSchema,
  CustomerMembershipPlanPublicSchema,
} from '@plataforma/shared';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipPlanRepository } from './customer-membership-plan.repository.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

interface PlanRecord {
  publicId: string;
  name: string;
  description: string | null;
  priceCents: bigint;
  billingInterval: string;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  benefits: Array<{
    publicId: string;
    service: { publicId: string; name: string };
    type: string;
    quantityPerCycle: number | null;
    discountPercent: number | null;
  }>;
}

const pub = (plan: PlanRecord) =>
  CustomerMembershipPlanPublicSchema.parse({
    publicId: plan.publicId,
    name: plan.name,
    description: plan.description,
    priceCents: Number(plan.priceCents),
    billingInterval: plan.billingInterval,
    active: plan.active,
    sortOrder: plan.sortOrder,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    benefits: plan.benefits.map((b) => ({
      publicId: b.publicId,
      servicePublicId: b.service.publicId,
      serviceName: b.service.name,
      type: b.type,
      quantityPerCycle: b.quantityPerCycle ?? null,
      discountPercent: b.discountPercent ?? null,
    })),
  });

function notFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_PLAN_NOT_FOUND',
    message: 'Plano de assinatura não encontrado.',
    statusCode: 404,
  });
}

export class CustomerMembershipPlanService {
  public constructor(private readonly repository: CustomerMembershipPlanRepository) {}

  public async list(tenantId: bigint) {
    const items = await this.repository.list(tenantId);
    return CustomerMembershipPlanListResponseSchema.parse({
      items: items.map(pub),
    });
  }

  public async get(tenantId: bigint, publicId: string) {
    const item = await this.repository.find(tenantId, publicId);
    if (item === null) throw notFound();
    return pub(item);
  }

  public async create(
    tenantId: bigint,
    input: CreateCustomerMembershipPlanRequest,
    actor: Actor,
  ) {
    try {
      const publicId = randomUUID();
      const item = await this.repository.create({
        publicId,
        tenantId,
        name: input.name,
        description: input.description ?? null,
        priceCents: BigInt(input.priceCents),
        billingInterval: input.billingInterval,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 0,
      });
      await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'create');
      return pub(item);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_PLAN_NAME_CONFLICT',
          message: 'Já existe um plano com este nome.',
          statusCode: 409,
          cause: error,
        });
      throw error;
    }
  }

  public async update(
    tenantId: bigint,
    publicId: string,
    input: UpdateCustomerMembershipPlanRequest,
    actor: Actor,
  ) {
    const current = await this.repository.find(tenantId, publicId);
    if (current === null) throw notFound();

    try {
      const item = await this.repository.update(current.id, {
        name: input.name,
        description: input.description ?? null,
        priceCents: BigInt(input.priceCents),
        billingInterval: input.billingInterval,
        active: input.active ?? current.active,
        sortOrder: input.sortOrder ?? current.sortOrder,
      });
      await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'update');
      return pub(item);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_PLAN_NAME_CONFLICT',
          message: 'Já existe um plano com este nome.',
          statusCode: 409,
          cause: error,
        });
      throw error;
    }
  }

  public async delete(tenantId: bigint, publicId: string, actor: Actor) {
    const current = await this.repository.find(tenantId, publicId);
    if (current === null) throw notFound();

    await this.repository.delete(current.id);
    await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'delete');
  }
}
