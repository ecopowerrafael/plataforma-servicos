import { randomUUID } from 'node:crypto';
import {
  type CreateCustomerMembershipBenefitRequest,
  type UpdateCustomerMembershipBenefitRequest,
  CustomerMembershipBenefitListResponseSchema,
  CustomerMembershipBenefitPublicSchema,
} from '@plataforma/shared';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { CustomerMembershipPlanBenefitRepository } from './customer-membership-plan-benefit.repository.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

interface BenefitRecord {
  publicId: string;
  service: { publicId: string; name: string };
  type: string;
  quantityPerCycle: number | null;
  discountPercent: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const pub = (benefit: BenefitRecord) =>
  CustomerMembershipBenefitPublicSchema.parse({
    publicId: benefit.publicId,
    servicePublicId: benefit.service.publicId,
    serviceName: benefit.service.name,
    type: benefit.type,
    quantityPerCycle: benefit.quantityPerCycle ?? null,
    discountPercent: benefit.discountPercent ?? null,
    createdAt: benefit.createdAt.toISOString(),
    updatedAt: benefit.updatedAt.toISOString(),
  });

function planNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_PLAN_NOT_FOUND',
    message: 'Plano de assinatura não encontrado.',
    statusCode: 404,
  });
}

function benefitNotFound() {
  return new AppError({
    code: 'CUSTOMER_MEMBERSHIP_BENEFIT_NOT_FOUND',
    message: 'Benefício não encontrado.',
    statusCode: 404,
  });
}

function serviceNotFound() {
  return new AppError({
    code: 'SERVICE_NOT_FOUND',
    message: 'Serviço não encontrado.',
    statusCode: 404,
  });
}

export class CustomerMembershipPlanBenefitService {
  public constructor(private readonly repository: CustomerMembershipPlanBenefitRepository) {}

  public async list(tenantId: bigint, planPublicId: string) {
    const plan = await this.repository.findPlan(tenantId, planPublicId);
    if (plan === null) throw planNotFound();

    const items = await this.repository.list(plan.id);
    return CustomerMembershipBenefitListResponseSchema.parse({
      items: items.map(pub),
    });
  }

  public async get(tenantId: bigint, planPublicId: string, publicId: string) {
    const plan = await this.repository.findPlan(tenantId, planPublicId);
    if (plan === null) throw planNotFound();

    const item = await this.repository.find(plan.id, publicId);
    if (item === null) throw benefitNotFound();

    return pub(item);
  }

  public async create(
    tenantId: bigint,
    planPublicId: string,
    input: CreateCustomerMembershipBenefitRequest,
    actor: Actor,
  ) {
    const plan = await this.repository.findPlan(tenantId, planPublicId);
    if (plan === null) throw planNotFound();

    const service = await this.repository.findService(tenantId, input.servicePublicId);
    if (service === null) throw serviceNotFound();

    try {
      const publicId = randomUUID();
      const item = await this.repository.create({
        publicId,
        planId: plan.id,
        serviceId: service.id,
        type: input.type,
        quantityPerCycle: input.quantityPerCycle ?? null,
        discountPercent: input.discountPercent ?? null,
      });
      await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'create');
      return pub(item);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_BENEFIT_DUPLICATE_SERVICE',
          message: 'Este serviço já tem um benefício neste plano.',
          statusCode: 409,
          cause: error,
        });
      throw error;
    }
  }

  public async update(
    tenantId: bigint,
    planPublicId: string,
    publicId: string,
    input: UpdateCustomerMembershipBenefitRequest,
    actor: Actor,
  ) {
    const plan = await this.repository.findPlan(tenantId, planPublicId);
    if (plan === null) throw planNotFound();

    const current = await this.repository.find(plan.id, publicId);
    if (current === null) throw benefitNotFound();

    const service = await this.repository.findService(tenantId, input.servicePublicId);
    if (service === null) throw serviceNotFound();

    try {
      const item = await this.repository.update(current.id, {
        service: { connect: { id: service.id } },
        type: input.type,
        quantityPerCycle: input.quantityPerCycle ?? null,
        discountPercent: input.discountPercent ?? null,
      });
      await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'update');
      return pub(item);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'CUSTOMER_MEMBERSHIP_BENEFIT_DUPLICATE_SERVICE',
          message: 'Este serviço já tem um benefício neste plano.',
          statusCode: 409,
          cause: error,
        });
      throw error;
    }
  }

  public async delete(tenantId: bigint, planPublicId: string, publicId: string, actor: Actor) {
    const plan = await this.repository.findPlan(tenantId, planPublicId);
    if (plan === null) throw planNotFound();

    const current = await this.repository.find(plan.id, publicId);
    if (current === null) throw benefitNotFound();

    await this.repository.delete(current.id);
    await this.repository.audit(publicId, tenantId, actor.userId, actor.sessionId, 'delete');
  }
}
