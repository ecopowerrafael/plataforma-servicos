import { randomUUID } from 'node:crypto';

import {
  type CreateServiceVariationRequest,
  type UpdateServiceVariationRequest,
  ServiceVariationsResponseSchema,
  ServiceVariationPublicSchema,
} from '@plataforma/shared';

import { type PrismaServiceVariationRepository } from './service-variation.repository.js';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
interface Actor {
  userId: bigint;
  sessionId: bigint;
}
interface VariationRecord {
  publicId: string;
  service: { publicId: string };
  name: string;
  durationMinutes: number;
  priceCents: bigint;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const pub = (x: VariationRecord) =>
  ServiceVariationPublicSchema.parse({
    publicId: x.publicId,
    servicePublicId: x.service.publicId,
    name: x.name,
    durationMinutes: x.durationMinutes,
    priceCents: Number(x.priceCents),
    sortOrder: x.sortOrder,
    active: x.active,
    createdAt: x.createdAt.toISOString(),
    updatedAt: x.updatedAt.toISOString(),
  });
function notFound() {
  return new AppError({
    code: 'SERVICE_VARIATION_NOT_FOUND',
    message: 'Variação de serviço não encontrada.',
    statusCode: 404,
  });
}
export class ServiceVariationService {
  public constructor(private readonly repository: PrismaServiceVariationRepository) {}
  public async list(tenantId: bigint, servicePublicId: string) {
    const service = await this.getService(tenantId, servicePublicId);
    const items = await this.repository.list(tenantId, service.id);
    return ServiceVariationsResponseSchema.parse({ items: items.map(pub) });
  }
  public async create(
    tenantId: bigint,
    servicePublicId: string,
    input: CreateServiceVariationRequest,
    actor?: Actor,
  ) {
    const service = await this.getService(tenantId, servicePublicId);
    try {
      const item = await this.repository.create({
        publicId: randomUUID(),
        tenantId,
        serviceId: service.id,
        name: input.name,
        durationMinutes: input.durationMinutes,
        priceCents: BigInt(input.priceCents),
        sortOrder: input.sortOrder,
        active: input.active,
      });
      await this.audit(tenantId, item.publicId, 'service_variation.created', actor);
      return pub(item);
    } catch (error) {
      return this.conflict(error);
    }
  }
  public async update(
    tenantId: bigint,
    servicePublicId: string,
    publicId: string,
    input: UpdateServiceVariationRequest,
    actor?: Actor,
  ) {
    const service = await this.getService(tenantId, servicePublicId);
    const current = await this.repository.find(tenantId, service.id, publicId);
    if (current === null) throw notFound();
    try {
      const item = await this.repository.update(current.id, {
        name: input.name,
        durationMinutes: input.durationMinutes,
        priceCents: BigInt(input.priceCents),
        sortOrder: input.sortOrder,
        active: input.active,
      });
      await this.audit(tenantId, publicId, 'service_variation.updated', actor);
      return pub(item);
    } catch (error) {
      return this.conflict(error);
    }
  }
  public async setActive(
    tenantId: bigint,
    servicePublicId: string,
    publicId: string,
    active: boolean,
    actor?: Actor,
  ) {
    const service = await this.getService(tenantId, servicePublicId);
    const current = await this.repository.find(tenantId, service.id, publicId);
    if (current === null) throw notFound();
    await this.repository.update(current.id, { active });
    await this.audit(
      tenantId,
      publicId,
      active ? 'service_variation.activated' : 'service_variation.deactivated',
      actor,
    );
  }
  public async remove(tenantId: bigint, servicePublicId: string, publicId: string, actor?: Actor) {
    const service = await this.getService(tenantId, servicePublicId);
    const current = await this.repository.find(tenantId, service.id, publicId);
    if (current === null) throw notFound();
    await this.repository.delete(current.id);
    await this.audit(tenantId, publicId, 'service_variation.removed', actor);
  }
  private async getService(tenantId: bigint, publicId: string) {
    const service = await this.repository.findService(tenantId, publicId);
    if (service === null)
      throw new AppError({
        code: 'SERVICE_NOT_FOUND',
        message: 'Serviço não encontrado.',
        statusCode: 404,
      });
    return service;
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AppError({
        code: 'SERVICE_VARIATION_NAME_CONFLICT',
        message: 'Já existe uma variação com este nome para o serviço.',
        statusCode: 409,
        cause: error,
      });
    throw error;
  }
  private async audit(tenantId: bigint, targetPublicId: string, action: string, actor?: Actor) {
    if (actor === undefined) return;
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'service_variation',
      targetPublicId,
    });
  }
}
