import { randomUUID } from 'node:crypto';

import {
  type CreateServiceCategoryRequest,
  ServiceCategoryListResponseSchema,
  ServiceCategoryPublicSchema,
  type UpdateServiceCategoryRequest,
} from '@plataforma/shared';

import {
  type ServiceCategoryRecord,
  type ServiceCategoryRepository,
} from './service-category.repository.js';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
interface ListInput {
  page: number;
  limit: number;
  search?: string | undefined;
  active?: boolean | undefined;
}
function toPublic(category: ServiceCategoryRecord) {
  return ServiceCategoryPublicSchema.parse({
    publicId: category.publicId,
    name: category.name,
    description: category.description,
    color: category.color,
    icon: category.icon,
    serviceCount: category._count.services,
    sortOrder: category.sortOrder,
    active: category.active,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  });
}
function notFound() {
  return new AppError({
    code: 'SERVICE_CATEGORY_NOT_FOUND',
    message: 'Categoria de servi\u00e7o n\u00e3o encontrada.',
    statusCode: 404,
  });
}

export class ServiceCategoryService {
  public constructor(private readonly repository: ServiceCategoryRepository) {}
  public async list(tenantId: bigint, input: ListInput) {
    const { total, categories } = await this.repository.list(
      {
        tenantId,
        ...(input.search === undefined ? {} : { name: { contains: input.search } }),
        ...(input.active === undefined ? {} : { active: input.active }),
      },
      input.page,
      input.limit,
    );
    return ServiceCategoryListResponseSchema.parse({
      items: categories.map(toPublic),
      page: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    });
  }
  public async get(tenantId: bigint, publicId: string) {
    const category = await this.repository.find(tenantId, publicId);
    if (category === null) throw notFound();
    return toPublic(category);
  }
  public async create(tenantId: bigint, input: CreateServiceCategoryRequest, actor?: Actor) {
    try {
      const category = await this.repository.create({
        publicId: randomUUID(),
        tenantId,
        ...input,
        description: input.description ?? null,
        icon: input.icon ?? null,
      });
      await this.audit(tenantId, category.publicId, 'service_category.created', actor);
      return toPublic(category);
    } catch (error) {
      return this.conflict(error);
    }
  }
  public async update(
    tenantId: bigint,
    publicId: string,
    input: UpdateServiceCategoryRequest,
    actor?: Actor,
  ) {
    const current = await this.repository.find(tenantId, publicId);
    if (current === null) throw notFound();
    try {
      const category = await this.repository.update(current.id, {
        ...input,
        description: input.description ?? null,
        icon: input.icon ?? null,
      });
      await this.audit(tenantId, publicId, 'service_category.updated', actor);
      return toPublic(category);
    } catch (error) {
      return this.conflict(error);
    }
  }
  public async setActive(tenantId: bigint, publicId: string, active: boolean, actor?: Actor) {
    const current = await this.repository.find(tenantId, publicId);
    if (current === null) throw notFound();
    await this.repository.update(current.id, { active });
    await this.audit(
      tenantId,
      publicId,
      active ? 'service_category.activated' : 'service_category.deactivated',
      actor,
    );
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AppError({
        code: 'SERVICE_CATEGORY_NAME_CONFLICT',
        message: 'J\u00e1 existe uma categoria com este nome.',
        statusCode: 409,
        cause: error,
      });
    throw error;
  }
  private async audit(tenantId: bigint, targetPublicId: string, action: string, actor?: Actor) {
    if (actor === undefined) return;
    await this.repository.recordAudit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'service_category',
      targetPublicId,
    });
  }
}
