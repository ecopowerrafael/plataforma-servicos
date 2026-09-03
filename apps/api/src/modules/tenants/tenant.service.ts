import { randomUUID } from 'node:crypto';

import {
  type BusinessUnit,
  type BusinessUnitInput,
  type CreateTenantRequest,
  type CreateTenantResponse,
  type TenantPublic,
  type TenantSettings,
} from '@plataforma/shared';

import {
  type TenantRepository,
  TenantRepositoryConflictError,
  type TenantRequestContext,
} from './tenant.repository.js';
import { AppError } from '../../errors/AppError.js';

function conflictError(error: TenantRepositoryConflictError): AppError {
  switch (error.conflict) {
    case 'TENANT_SLUG':
      return new AppError({
        code: 'TENANT_SLUG_CONFLICT',
        message: 'O slug do estabelecimento já está em uso.',
        statusCode: 409,
        cause: error,
      });
    case 'BUSINESS_UNIT_SLUG':
      return new AppError({
        code: 'BUSINESS_UNIT_SLUG_CONFLICT',
        message: 'O slug da unidade já está em uso neste estabelecimento.',
        statusCode: 409,
        cause: error,
      });
    case 'HEADQUARTERS':
      return new AppError({
        code: 'TENANT_HEADQUARTERS_CONFLICT',
        message: 'O estabelecimento já possui uma unidade matriz.',
        statusCode: 409,
        cause: error,
      });
    case 'UNIQUE_VALUE':
      return new AppError({
        code: 'TENANT_STRUCTURE_CONFLICT',
        message: 'Não foi possível criar a estrutura com os identificadores informados.',
        statusCode: 409,
        cause: error,
      });
  }
}

interface Actor {
  userId: bigint;
  sessionId: bigint | null;
}

export class TenantService {
  public constructor(private readonly repository: TenantRepository) {}

  public async createTenant(input: CreateTenantRequest): Promise<CreateTenantResponse> {
    const tenant: TenantPublic & { legalName: string } = {
      publicId: randomUUID(),
      slug: input.slug,
      legalName: input.legalName,
      displayName: input.displayName,
      status: 'ACTIVE',
      timezone: input.timezone,
      locale: input.locale,
      currency: input.currency,
    };
    const settings: TenantSettings = input.settings;
    const initialUnit: BusinessUnit = {
      publicId: randomUUID(),
      name: input.initialUnit.name,
      slug: input.initialUnit.slug,
      status: 'ACTIVE',
      isHeadquarters: true,
      timezone: input.timezone,
      postalCode: input.initialUnit.postalCode ?? null,
      street: input.initialUnit.street ?? null,
      number: input.initialUnit.number ?? null,
      complement: input.initialUnit.complement ?? null,
      district: input.initialUnit.district ?? null,
      city: input.initialUnit.city ?? null,
      state: input.initialUnit.state ?? null,
      countryCode: input.initialUnit.countryCode ?? null,
      latitude: input.initialUnit.latitude ?? null,
      longitude: input.initialUnit.longitude ?? null,
      googleMapsUrl: input.initialUnit.googleMapsUrl ?? null,
    };

    try {
      return await this.repository.createTenant({ tenant, settings, initialUnit });
    } catch (error) {
      if (error instanceof TenantRepositoryConflictError) {
        throw conflictError(error);
      }

      throw error;
    }
  }

  public findTenantByPublicId(publicId: string): Promise<TenantRequestContext | null> {
    return this.repository.findTenantByPublicId(publicId);
  }

  public listBusinessUnits(tenantId: bigint): Promise<BusinessUnit[]> {
    return this.repository.listBusinessUnits(tenantId);
  }

  public async getBusinessUnit(tenantId: bigint, publicId: string): Promise<BusinessUnit> {
    const unit = await this.repository.findBusinessUnit(tenantId, publicId);
    if (unit === null) throw this.businessUnitNotFound();
    return unit;
  }

  public async createBusinessUnit(
    tenantId: bigint,
    tenantTimezone: string,
    input: BusinessUnitInput,
    actor?: Actor,
  ): Promise<BusinessUnit> {
    try {
      const unit = await this.repository.createBusinessUnit(tenantId, tenantTimezone, input);
      await this.logUnit(tenantId, unit.publicId, 'business_unit.created', actor);
      return unit;
    } catch (error) {
      if (error instanceof TenantRepositoryConflictError) throw conflictError(error);
      throw error;
    }
  }

  public async updateBusinessUnit(
    tenantId: bigint,
    publicId: string,
    tenantTimezone: string,
    input: BusinessUnitInput,
    actor?: Actor,
  ): Promise<BusinessUnit> {
    try {
      const unit = await this.repository.updateBusinessUnit(
        tenantId,
        publicId,
        tenantTimezone,
        input,
      );
      if (unit === null) throw this.businessUnitNotFound();
      await this.logUnit(tenantId, unit.publicId, 'business_unit.updated', actor);
      return unit;
    } catch (error) {
      if (error instanceof TenantRepositoryConflictError) throw conflictError(error);
      throw error;
    }
  }

  public async setBusinessUnitActive(
    tenantId: bigint,
    publicId: string,
    active: boolean,
    actor?: Actor,
  ): Promise<BusinessUnit> {
    const current = await this.repository.findBusinessUnit(tenantId, publicId);
    if (current === null) throw this.businessUnitNotFound();

    if (!active) {
      if (current.isHeadquarters) {
        throw new AppError({
          code: 'BUSINESS_UNIT_HEADQUARTERS_INACTIVE',
          message: 'A unidade matriz não pode ser desativada.',
          statusCode: 409,
        });
      }
      const activeCount = await this.repository.countActiveBusinessUnits(tenantId);
      if (current.status === 'ACTIVE' && activeCount <= 1) {
        throw new AppError({
          code: 'BUSINESS_UNIT_LAST_ACTIVE',
          message: 'O estabelecimento deve manter ao menos uma unidade ativa.',
          statusCode: 409,
        });
      }
    }

    const unit = await this.repository.setBusinessUnitStatus(tenantId, publicId, active);
    if (unit === null) throw this.businessUnitNotFound();
    await this.logUnit(
      tenantId,
      publicId,
      active ? 'business_unit.activated' : 'business_unit.deactivated',
      actor,
    );
    return unit;
  }

  public async setHeadquarters(
    tenantId: bigint,
    publicId: string,
    actor?: Actor,
  ): Promise<BusinessUnit> {
    const current = await this.repository.findBusinessUnit(tenantId, publicId);
    if (current === null) throw this.businessUnitNotFound();
    if (current.status !== 'ACTIVE') {
      throw new AppError({
        code: 'BUSINESS_UNIT_INACTIVE',
        message: 'Somente uma unidade ativa pode se tornar a matriz.',
        statusCode: 409,
      });
    }

    const unit = await this.repository.setHeadquarters(tenantId, publicId);
    if (unit === null) throw this.businessUnitNotFound();
    await this.logUnit(tenantId, publicId, 'business_unit.headquarters_changed', actor);
    return unit;
  }

  private businessUnitNotFound(): AppError {
    return new AppError({
      code: 'BUSINESS_UNIT_NOT_FOUND',
      message: 'Unidade não encontrada.',
      statusCode: 404,
    });
  }

  private async logUnit(
    tenantId: bigint,
    targetPublicId: string,
    action: string,
    actor?: Actor,
  ): Promise<void> {
    if (actor === undefined) return;
    await this.repository.auditBusinessUnit({
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetPublicId,
    });
  }

  public async getSettings(tenantId: bigint): Promise<TenantSettings> {
    const settings = await this.repository.findSettings(tenantId);

    if (settings === null) {
      throw new Error('As configurações estruturais do tenant não foram encontradas.');
    }

    return settings;
  }

  public async updateSettings(tenantId: bigint, settings: TenantSettings): Promise<TenantSettings> {
    const updated = await this.repository.updateSettings(tenantId, settings);

    if (updated === null) {
      throw new Error('As configurações estruturais do tenant não foram encontradas.');
    }

    return updated;
  }
}
