import { randomUUID } from 'node:crypto';

import {
  type CreateServiceRequest,
  ServiceListResponseSchema,
  ServicePublicSchema,
  type UpdateServiceRequest,
} from '@plataforma/shared';

import { type ServiceImageStorage } from './service-image.storage.js';
import { type ServiceRecord, type ServiceRepository } from './service.repository.js';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface ServiceListInput {
  page: number;
  limit: number;
  search?: string | undefined;
  active?: boolean | undefined;
  categoryPublicId?: string | undefined;
}

interface ServiceAuditActor {
  userId: bigint;
  sessionId: bigint;
}

function toPublic(service: ServiceRecord) {
  return ServicePublicSchema.parse({
    publicId: service.publicId,
    name: service.name,
    description: service.description,
    imageAlt: service.imageAlt,
    iconKey: service.iconKey,
    categoryPublicId: service.category?.publicId ?? null,
    categoryName: service.category?.name ?? null,
    enabledProfessionalCount: service._count.professionalServices,
    imageUrl: service.imagePath === null ? null : `/tenant/services/${service.publicId}/image`,
    durationMinutes: service.durationMinutes,
    hasPostServiceBreak: service.hasPostServiceBreak,
    postServiceBreakMinutes: service.postServiceBreakMinutes,
    priceCents: service.priceCents.toString(),
    pricingMode: service.pricingMode,
    quoteNotice: service.quoteNotice,
    color: service.color,
    sortOrder: service.sortOrder,
    active: service.active,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  });
}

function serviceNotFound(): AppError {
  return new AppError({
    code: 'SERVICE_NOT_FOUND',
    message: 'Servi\u00e7o n\u00e3o encontrado.',
    statusCode: 404,
  });
}

function serviceNameConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError({
      code: 'SERVICE_NAME_CONFLICT',
      message: 'J\u00e1 existe um servi\u00e7o com este nome.',
      statusCode: 409,
      cause: error,
    });
  }
  throw error;
}

export class ServiceService {
  public constructor(
    private readonly repository: ServiceRepository,
    private readonly images: ServiceImageStorage,
  ) {}

  public async list(tenantId: bigint, input: ServiceListInput) {
    const where: Prisma.ServiceWhereInput = {
      tenantId,
      ...(input.search === undefined ? {} : { name: { contains: input.search } }),
      ...(input.active === undefined ? {} : { active: input.active }),
      ...(input.categoryPublicId === undefined
        ? {}
        : { category: { publicId: input.categoryPublicId } }),
    };
    const { total, services } = await this.repository.list(where, input.page, input.limit);
    return ServiceListResponseSchema.parse({
      items: services.map(toPublic),
      page: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    });
  }

  public async get(tenantId: bigint, publicId: string) {
    const service = await this.repository.find(tenantId, publicId);
    if (service === null) throw serviceNotFound();
    return toPublic(service);
  }

  public async create(tenantId: bigint, input: CreateServiceRequest, actor?: ServiceAuditActor) {
    try {
      const categoryId = await this.categoryId(tenantId, input.categoryPublicId);
      const service = await this.repository.create({
        publicId: randomUUID(),
        tenantId,
        categoryId,
        name: input.name,
        description: input.description ?? null,
        imageAlt: input.imageAlt ?? null,
        iconKey: input.iconKey ?? null,
        durationMinutes: input.durationMinutes,
        hasPostServiceBreak: input.hasPostServiceBreak,
        postServiceBreakMinutes: input.postServiceBreakMinutes,
        priceCents: BigInt(input.priceCents),
        // Sem escolha explícita o serviço continua com preço fixo.
        pricingMode: input.pricingMode ?? 'FIXED',
        quoteNotice: input.quoteNotice ?? null,
        color: input.color,
        sortOrder: input.sortOrder,
        active: input.active,
      });
      await this.recordAudit(tenantId, service.publicId, 'service.created', actor);
      return toPublic(service);
    } catch (error) {
      return serviceNameConflict(error);
    }
  }

  public async update(
    tenantId: bigint,
    publicId: string,
    input: UpdateServiceRequest,
    actor?: ServiceAuditActor,
  ) {
    const existing = await this.repository.find(tenantId, publicId);
    if (existing === null) throw serviceNotFound();
    try {
      const categoryId = await this.categoryId(tenantId, input.categoryPublicId);
      const service = await this.repository.update(existing.id, {
        name: input.name,
        categoryId,
        description: input.description ?? null,
        imageAlt: input.imageAlt ?? null,
        iconKey: input.iconKey ?? null,
        durationMinutes: input.durationMinutes,
        hasPostServiceBreak: input.hasPostServiceBreak,
        postServiceBreakMinutes: input.postServiceBreakMinutes,
        priceCents: BigInt(input.priceCents),
        pricingMode: input.pricingMode ?? 'FIXED',
        quoteNotice: input.quoteNotice ?? null,
        color: input.color,
        sortOrder: input.sortOrder,
        ...(input.active === undefined ? {} : { active: input.active }),
      });
      await this.recordAudit(tenantId, service.publicId, 'service.updated', actor);
      return toPublic(service);
    } catch (error) {
      return serviceNameConflict(error);
    }
  }

  public async setActive(
    tenantId: bigint,
    publicId: string,
    active: boolean,
    actor?: ServiceAuditActor,
  ) {
    const existing = await this.repository.find(tenantId, publicId);
    if (existing === null) throw serviceNotFound();
    await this.repository.update(existing.id, { active });
    await this.recordAudit(
      tenantId,
      publicId,
      active ? 'service.activated' : 'service.deactivated',
      actor,
    );
  }

  public async replaceImage(
    tenantId: bigint,
    publicId: string,
    image: Buffer,
    actor?: ServiceAuditActor,
  ) {
    const service = await this.repository.findWithTenant(tenantId, publicId);
    if (service === null) throw serviceNotFound();
    const stored = await this.images.save(service.tenant.publicId, service.publicId, image);
    try {
      const updated = await this.repository.update(service.id, { imagePath: stored.key });
      if (service.imagePath !== null) await this.images.remove(service.imagePath);
      await this.recordAudit(tenantId, updated.publicId, 'service.image_replaced', actor);
      return toPublic(updated);
    } catch (error) {
      await this.images.remove(stored.key);
      throw error;
    }
  }

  public async removeImage(tenantId: bigint, publicId: string, actor?: ServiceAuditActor) {
    const service = await this.repository.find(tenantId, publicId);
    if (service === null) throw serviceNotFound();
    if (service.imagePath === null) return toPublic(service);
    const updated = await this.repository.update(service.id, { imagePath: null });
    await this.images.remove(service.imagePath);
    await this.recordAudit(tenantId, updated.publicId, 'service.image_removed', actor);
    return toPublic(updated);
  }

  public async getImage(
    tenantId: bigint,
    publicId: string,
    variant: 'original' | 'thumbnail' = 'original',
  ) {
    const service = await this.repository.find(tenantId, publicId);
    const imagePath = service?.imagePath;
    if (imagePath === null || imagePath === undefined) throw serviceNotFound();
    return this.images.read(imagePath, variant);
  }

  private async recordAudit(
    tenantId: bigint,
    targetPublicId: string,
    action: string,
    actor: ServiceAuditActor | undefined,
  ): Promise<void> {
    if (actor === undefined) return;
    await this.repository.recordAudit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'service',
      targetPublicId,
    });
  }

  private async categoryId(
    tenantId: bigint,
    publicId: string | null | undefined,
  ): Promise<bigint | null> {
    if (publicId === null || publicId === undefined) return null;
    const category = await this.repository.findCategory?.(tenantId, publicId);
    if (!category?.active) {
      throw new AppError({
        code: 'SERVICE_CATEGORY_NOT_AVAILABLE',
        message: 'Categoria de servi\u00e7o indispon\u00edvel.',
        statusCode: 400,
      });
    }
    return category.id;
  }
}
