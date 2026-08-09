import { randomUUID } from 'node:crypto';

import {
  type CreateComboRequest,
  type UpdateComboRequest,
  blockedServiceMinutes,
  ComboEligibleProfessionalsResponseSchema,
  ComboListResponseSchema,
  ComboPublicSchema,
} from '@plataforma/shared';

import { type ComboRecord, type PrismaComboRepository } from './combo.repository.js';
import { type ServiceImageStorage } from './service-image.storage.js';
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

function notFound() {
  return new AppError({
    code: 'COMBO_NOT_FOUND',
    message: 'Combo não encontrado.',
    statusCode: 404,
  });
}

function nameConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new AppError({
      code: 'COMBO_NAME_CONFLICT',
      message: 'Já existe um combo com este nome.',
      statusCode: 409,
      cause: error,
    });
  throw error;
}

function pub(combo: ComboRecord) {
  const durationMinutes = combo.items.reduce(
    (total, item) =>
      total +
      blockedServiceMinutes(
        item.service.durationMinutes,
        item.service.hasPostServiceBreak,
        item.service.postServiceBreakMinutes,
      ),
    0,
  );
  return ComboPublicSchema.parse({
    publicId: combo.publicId,
    name: combo.name,
    description: combo.description,
    imageAlt: combo.imageAlt,
    imageUrl: combo.imagePath === null ? null : `/tenant/combos/${combo.publicId}/image`,
    priceCents: combo.priceCents.toString(),
    sortOrder: combo.sortOrder,
    active: combo.active,
    items: combo.items.map((item) => ({
      servicePublicId: item.service.publicId,
      name: item.service.name,
      sortOrder: item.sortOrder,
      durationMinutes: item.service.durationMinutes,
      hasPostServiceBreak: item.service.hasPostServiceBreak,
      postServiceBreakMinutes: item.service.postServiceBreakMinutes,
    })),
    durationMinutes,
    createdAt: combo.createdAt.toISOString(),
    updatedAt: combo.updatedAt.toISOString(),
  });
}

export class ComboService {
  public constructor(
    private readonly repository: PrismaComboRepository,
    private readonly images: ServiceImageStorage,
  ) {}

  public async list(tenantId: bigint, input: ListInput) {
    const { total, combos } = await this.repository.list(
      {
        tenantId,
        ...(input.search === undefined ? {} : { name: { contains: input.search } }),
        ...(input.active === undefined ? {} : { active: input.active }),
      },
      input.page,
      input.limit,
    );
    return ComboListResponseSchema.parse({
      items: combos.map(pub),
      page: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    });
  }

  public async get(tenantId: bigint, publicId: string) {
    const combo = await this.repository.find(tenantId, publicId);
    if (combo === null) throw notFound();
    return pub(combo);
  }

  public async create(tenantId: bigint, input: CreateComboRequest, actor?: Actor) {
    const items = await this.resolveItems(tenantId, input.items);
    try {
      const combo = await this.repository.create(
        tenantId,
        randomUUID(),
        {
          name: input.name,
          description: input.description ?? null,
          imageAlt: input.imageAlt ?? null,
          priceCents: BigInt(input.priceCents),
          sortOrder: input.sortOrder,
          active: input.active,
        },
        items,
      );
      await this.audit(tenantId, combo.publicId, 'combo.created', actor);
      return pub(combo);
    } catch (error) {
      return nameConflict(error);
    }
  }

  public async update(
    tenantId: bigint,
    publicId: string,
    input: UpdateComboRequest,
    actor?: Actor,
  ) {
    const existing = await this.repository.find(tenantId, publicId);
    if (existing === null) throw notFound();
    const items = await this.resolveItems(tenantId, input.items);
    try {
      const combo = await this.repository.update(
        tenantId,
        existing.id,
        {
          name: input.name,
          description: input.description ?? null,
          imageAlt: input.imageAlt ?? null,
          priceCents: BigInt(input.priceCents),
          sortOrder: input.sortOrder,
          active: input.active,
        },
        items,
      );
      await this.audit(tenantId, combo.publicId, 'combo.updated', actor);
      return pub(combo);
    } catch (error) {
      return nameConflict(error);
    }
  }

  public async setActive(tenantId: bigint, publicId: string, active: boolean, actor?: Actor) {
    const existing = await this.repository.find(tenantId, publicId);
    if (existing === null) throw notFound();
    await this.repository.setActive(existing.id, active);
    await this.audit(tenantId, publicId, active ? 'combo.activated' : 'combo.deactivated', actor);
  }

  public async replaceImage(tenantId: bigint, publicId: string, image: Buffer, actor?: Actor) {
    const combo = await this.repository.findWithTenant(tenantId, publicId);
    if (combo === null) throw notFound();
    const stored = await this.images.save(combo.tenant.publicId, combo.publicId, image);
    try {
      const updated = await this.repository.updateImage(combo.id, stored.key);
      if (combo.imagePath !== null) await this.images.remove(combo.imagePath);
      await this.audit(tenantId, updated.publicId, 'combo.image_replaced', actor);
      return pub(updated);
    } catch (error) {
      await this.images.remove(stored.key);
      throw error;
    }
  }

  public async removeImage(tenantId: bigint, publicId: string, actor?: Actor) {
    const combo = await this.repository.find(tenantId, publicId);
    if (combo === null) throw notFound();
    if (combo.imagePath === null) return pub(combo);
    const updated = await this.repository.updateImage(combo.id, null);
    await this.images.remove(combo.imagePath);
    await this.audit(tenantId, updated.publicId, 'combo.image_removed', actor);
    return pub(updated);
  }

  public async getImage(tenantId: bigint, publicId: string) {
    const combo = await this.repository.find(tenantId, publicId);
    const imagePath = combo?.imagePath;
    if (imagePath === null || imagePath === undefined) throw notFound();
    return this.images.read(imagePath);
  }

  public async eligibleProfessionals(tenantId: bigint, publicId: string) {
    const combo = await this.repository.find(tenantId, publicId);
    if (combo === null) throw notFound();
    const serviceIds = combo.items.map((item) => item.serviceId);
    const links = await this.repository.professionalsLinkedToServices(tenantId, serviceIds);
    const byProfessional = new Map<
      string,
      { professionalId: bigint; publicId: string; publicName: string; serviceIds: Set<bigint> }
    >();
    for (const link of links) {
      const key = link.professionalId.toString();
      const entry = byProfessional.get(key) ?? {
        professionalId: link.professionalId,
        publicId: link.professional.publicId,
        publicName: link.professional.publicName,
        serviceIds: new Set<bigint>(),
      };
      entry.serviceIds.add(link.serviceId);
      byProfessional.set(key, entry);
    }
    const eligible = [...byProfessional.values()].filter(
      (entry) => entry.serviceIds.size === serviceIds.length,
    );
    return ComboEligibleProfessionalsResponseSchema.parse({
      items: eligible.map((entry) => ({ publicId: entry.publicId, publicName: entry.publicName })),
    });
  }

  private async resolveItems(
    tenantId: bigint,
    items: { servicePublicId: string; sortOrder: number }[],
  ) {
    const services = await this.repository.findServices(
      tenantId,
      items.map((item) => item.servicePublicId),
    );
    const byPublicId = new Map(services.map((service) => [service.publicId, service]));
    return items.map((item) => {
      const service = byPublicId.get(item.servicePublicId);
      if (service?.active !== true)
        throw new AppError({
          code: 'COMBO_SERVICE_NOT_AVAILABLE',
          message: 'Um dos serviços do combo não foi encontrado ou está inativo.',
          statusCode: 400,
        });
      return { serviceId: service.id, sortOrder: item.sortOrder };
    });
  }

  private async audit(tenantId: bigint, targetPublicId: string, action: string, actor?: Actor) {
    if (actor === undefined) return;
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'combo',
      targetPublicId,
    });
  }
}
