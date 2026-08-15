import { randomUUID } from 'node:crypto';

import {
  type CreateProfessionalRequest,
  ProfessionalListResponseSchema,
  ProfessionalPublicSchema,
  type UpdateProfessionalRequest,
} from '@plataforma/shared';

import { type ProfessionalRecord, type ProfessionalRepository } from './professional.repository.js';
import { Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type ServiceImageStorage } from '../services/service-image.storage.js';
interface Actor {
  userId: bigint;
  sessionId: bigint;
}
interface List {
  page: number;
  limit: number;
  search?: string | undefined;
  active?: boolean | undefined;
}
const publicValue = (item: ProfessionalRecord) =>
  ProfessionalPublicSchema.parse({
    publicId: item.publicId,
    name: item.name,
    publicName: item.publicName,
    bio: item.bio,
    photoUrl: item.photoPath === null ? null : `/tenant/professionals/${item.publicId}/photo`,
    phone: item.phone,
    email: item.email,
    professionalDocument: item.professionalDocument,
    specialties: item.specialties ?? [],
    calendarColor: item.calendarColor,
    sortOrder: item.sortOrder,
    active: item.active,
    primaryUnitPublicId: item.primaryUnit?.publicId ?? null,
    userPublicId: item.user?.publicId ?? null,
    commissionType: item.commissionType,
    commissionValue: item.commissionValue,
    customFields: item.customFields ?? {},
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
export class ProfessionalService {
  public constructor(
    private readonly repository: ProfessionalRepository,
    private readonly images: ServiceImageStorage,
  ) {}
  public async list(tenantId: bigint, input: List) {
    const { total, items } = await this.repository.list(
      {
        tenantId,
        ...(input.search === undefined ? {} : { name: { contains: input.search } }),
        ...(input.active === undefined ? {} : { active: input.active }),
      },
      input.page,
      input.limit,
    );
    return ProfessionalListResponseSchema.parse({
      items: items.map(publicValue),
      page: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    });
  }
  public async get(tenantId: bigint, id: string) {
    const item = await this.repository.find(tenantId, id);
    if (item === null) throw this.notFound();
    return publicValue(item);
  }
  public async me(tenantId: bigint, userId: bigint) {
    return publicValue(await this.myRecord(tenantId, userId));
  }
  public async updateMyProfile(
    tenantId: bigint,
    userId: bigint,
    input: Pick<UpdateProfessionalRequest, 'name' | 'publicName' | 'bio' | 'phone'>,
    actor: Actor,
  ) {
    const current = await this.myRecord(tenantId, userId);
    const updated = await this.repository.update(current.id, {
      name: input.name,
      publicName: input.publicName,
      bio: input.bio ?? null,
      phone: input.phone ?? null,
    });
    await this.log(tenantId, updated.publicId, 'professional.self_profile_updated', actor);
    return publicValue(updated);
  }
  public async myId(tenantId: bigint, userId: bigint) {
    return (await this.myRecord(tenantId, userId)).id;
  }
  private async myRecord(tenantId: bigint, userId: bigint) {
    const item = await this.repository.findByUserId(tenantId, userId);
    if (item === null)
      throw new AppError({
        code: 'PROFESSIONAL_ACCOUNT_NOT_LINKED',
        message: 'Nenhum profissional está vinculado a esta conta.',
        statusCode: 404,
      });
    return item;
  }
  public async create(tenantId: bigint, input: CreateProfessionalRequest, actor?: Actor) {
    const data = await this.data(tenantId, input);
    let item: ProfessionalRecord;
    try {
      item = await this.repository.create({ publicId: randomUUID(), tenantId, ...data });
    } catch (error) {
      this.conflict(error);
    }
    await this.log(tenantId, item.publicId, 'professional.created', actor);
    return publicValue(item);
  }
  public async update(
    tenantId: bigint,
    id: string,
    input: UpdateProfessionalRequest,
    actor?: Actor,
  ) {
    const old = await this.repository.find(tenantId, id);
    if (old === null) throw this.notFound();
    let item: ProfessionalRecord;
    try {
      item = await this.repository.update(old.id, await this.data(tenantId, input));
    } catch (error) {
      this.conflict(error);
    }
    await this.log(tenantId, id, 'professional.updated', actor);
    return publicValue(item);
  }
  public async setActive(tenantId: bigint, id: string, active: boolean, actor?: Actor) {
    const old = await this.repository.find(tenantId, id);
    if (old === null) throw this.notFound();
    await this.repository.update(old.id, { active });
    await this.log(
      tenantId,
      id,
      active ? 'professional.activated' : 'professional.deactivated',
      actor,
    );
  }
  public async replacePhoto(tenantId: bigint, id: string, image: Buffer, actor?: Actor) {
    const item = await this.repository.find(tenantId, id);
    if (item === null) throw this.notFound();
    const saved = await this.images.save(item.tenant.publicId, item.publicId, image);
    try {
      const updated = await this.repository.update(item.id, { photoPath: saved.key });
      if (item.photoPath !== null) await this.images.remove(item.photoPath);
      await this.log(tenantId, id, 'professional.photo_replaced', actor);
      return publicValue(updated);
    } catch (error) {
      await this.images.remove(saved.key);
      throw error;
    }
  }
  public async removePhoto(tenantId: bigint, id: string, actor?: Actor) {
    const item = await this.repository.find(tenantId, id);
    if (item === null) throw this.notFound();
    const updated = await this.repository.update(item.id, { photoPath: null });
    if (item.photoPath !== null) await this.images.remove(item.photoPath);
    await this.log(tenantId, id, 'professional.photo_removed', actor);
    return publicValue(updated);
  }
  public async photo(
    tenantId: bigint,
    id: string,
    variant: 'original' | 'thumbnail' = 'original',
  ) {
    const item = await this.repository.find(tenantId, id);
    const photoPath = item?.photoPath;
    if (photoPath === null || photoPath === undefined) throw this.notFound();
    return this.images.read(photoPath, variant);
  }
  private async data(
    tenantId: bigint,
    input: CreateProfessionalRequest | UpdateProfessionalRequest,
  ) {
    const unit =
      input.primaryUnitPublicId === null || input.primaryUnitPublicId === undefined
        ? null
        : await this.repository.findUnit(tenantId, input.primaryUnitPublicId);
    if (
      unit === null &&
      input.primaryUnitPublicId !== null &&
      input.primaryUnitPublicId !== undefined
    )
      throw new AppError({
        code: 'PROFESSIONAL_UNIT_NOT_FOUND',
        message: 'Unidade principal n\u00e3o encontrada.',
        statusCode: 400,
      });
    const member =
      input.userPublicId === null || input.userPublicId === undefined
        ? null
        : await this.repository.findMember(tenantId, input.userPublicId);
    if (member === null && input.userPublicId !== null && input.userPublicId !== undefined)
      throw new AppError({
        code: 'PROFESSIONAL_USER_NOT_FOUND',
        message: 'Usuário do estabelecimento não encontrado.',
        statusCode: 400,
      });
    await this.validateFields(tenantId, input.customFields);
    return {
      name: input.name,
      publicName: input.publicName,
      bio: input.bio ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      professionalDocument: input.professionalDocument ?? null,
      specialties: input.specialties as Prisma.InputJsonValue,
      calendarColor: input.calendarColor,
      sortOrder: input.sortOrder,
      active: input.active,
      primaryUnitId: unit?.id ?? null,
      userId: member?.id ?? null,
      commissionType: input.commissionType,
      commissionValue: input.commissionValue,
      customFields: input.customFields as Prisma.InputJsonValue,
    };
  }
  private async validateFields(tenantId: bigint, values: Record<string, unknown>) {
    const fields = await this.repository.fields(tenantId);
    for (const field of fields) {
      if (field.required && field.active && values[field.key] === undefined)
        throw new AppError({
          code: 'PROFESSIONAL_CUSTOM_FIELD_REQUIRED',
          message: 'Preencha os campos obrigat\u00f3rios.',
          statusCode: 400,
        });
    }
    for (const key of Object.keys(values)) {
      if (!fields.some((field) => field.key === key && field.active))
        throw new AppError({
          code: 'PROFESSIONAL_CUSTOM_FIELD_UNKNOWN',
          message: 'Campo configur\u00e1vel inv\u00e1lido.',
          statusCode: 400,
        });
    }
  }
  private notFound() {
    return new AppError({
      code: 'PROFESSIONAL_NOT_FOUND',
      message: 'Profissional n\u00e3o encontrado.',
      statusCode: 404,
    });
  }
  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AppError({
        code: 'PROFESSIONAL_USER_ALREADY_LINKED',
        message: 'Este usu\u00e1rio j\u00e1 est\u00e1 vinculado a outro profissional.',
        statusCode: 409,
        cause: error,
      });
    throw error;
  }
  private async log(tenantId: bigint, id: string, action: string, actor?: Actor) {
    if (actor === undefined) return;
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'professional',
      targetPublicId: id,
    });
  }
}
