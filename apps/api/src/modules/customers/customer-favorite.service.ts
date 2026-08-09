import { randomUUID } from 'node:crypto';

import {
  CustomerFavoriteListResponseSchema,
  CustomerFavoritePublicSchema,
  type CreateCustomerFavoriteRequest,
} from '@plataforma/shared';

import { type CustomerFavoriteRepository } from './customer-favorite.repository.js';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

type FavoriteRecord = Awaited<ReturnType<CustomerFavoriteRepository['create']>>;

const pub = (x: FavoriteRecord) =>
  CustomerFavoritePublicSchema.parse({
    publicId: x.publicId,
    professionalPublicId: x.professional?.publicId ?? null,
    professionalName: x.professional?.publicName ?? null,
    servicePublicId: x.service?.publicId ?? null,
    serviceName: x.service?.name ?? null,
    createdAt: x.createdAt.toISOString(),
  });

export class CustomerFavoriteService {
  public constructor(private readonly repo: CustomerFavoriteRepository) {}

  public async list(tenantId: bigint, customerId: bigint) {
    const items = await this.repo.list(tenantId, customerId);
    return CustomerFavoriteListResponseSchema.parse({ items: items.map(pub) });
  }

  public async create(tenantId: bigint, customerId: bigint, input: CreateCustomerFavoriteRequest) {
    const professional =
      input.professionalPublicId === undefined
        ? null
        : await this.repo.professional(tenantId, input.professionalPublicId);
    if (input.professionalPublicId !== undefined && professional === null)
      throw new AppError({
        code: 'PROFESSIONAL_NOT_FOUND',
        message: 'Profissional não encontrado.',
        statusCode: 404,
      });
    const service =
      input.servicePublicId === undefined
        ? null
        : await this.repo.service(tenantId, input.servicePublicId);
    if (input.servicePublicId !== undefined && service === null)
      throw new AppError({
        code: 'SERVICE_NOT_FOUND',
        message: 'Serviço não encontrado.',
        statusCode: 404,
      });
    const existing = await this.repo.findExisting(
      tenantId,
      customerId,
      professional?.id ?? null,
      service?.id ?? null,
    );
    if (existing !== null)
      throw new AppError({
        code: 'CUSTOMER_FAVORITE_ALREADY_EXISTS',
        message: 'Este item já está nos favoritos.',
        statusCode: 409,
      });
    let created: FavoriteRecord;
    try {
      created = await this.repo.create({
        publicId: randomUUID(),
        tenantId,
        customerId,
        professionalId: professional?.id ?? null,
        serviceId: service?.id ?? null,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError({
          code: 'CUSTOMER_FAVORITE_ALREADY_EXISTS',
          message: 'Este item já está nos favoritos.',
          statusCode: 409,
        });
      throw error;
    }
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId,
      userId: null,
      sessionId: null,
      action: 'customer.favorite.created',
      targetType: 'customer_favorite',
      targetPublicId: created.publicId,
    });
    return pub(created);
  }

  public async remove(tenantId: bigint, customerId: bigint, publicId: string) {
    const favorite = await this.repo.find(tenantId, customerId, publicId);
    if (favorite === null)
      throw new AppError({
        code: 'CUSTOMER_FAVORITE_NOT_FOUND',
        message: 'Favorito não encontrado.',
        statusCode: 404,
      });
    await this.repo.delete(favorite.id);
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId,
      userId: null,
      sessionId: null,
      action: 'customer.favorite.removed',
      targetType: 'customer_favorite',
      targetPublicId: favorite.publicId,
    });
    return { success: true } as const;
  }
}
