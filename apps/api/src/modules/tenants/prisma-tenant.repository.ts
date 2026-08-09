import { randomUUID } from 'node:crypto';

import {
  BusinessUnitSchema,
  TenantPublicSchema,
  TenantSettingsSchema,
  type BusinessUnit,
  type BusinessUnitInput,
  type TenantSettings,
  type TimeFormat,
} from '@plataforma/shared';

import {
  type BusinessUnitAuditEntry,
  type CreateTenantPersistenceInput,
  type TenantRepository,
  TenantRepositoryConflictError,
  type TenantRequestContext,
} from './tenant.repository.js';
import { Prisma, type PrismaClient } from '../../database-client/client.js';

const businessUnitSelect = {
  publicId: true,
  name: true,
  slug: true,
  status: true,
  isHeadquarters: true,
  timezone: true,
  postalCode: true,
  street: true,
  number: true,
  complement: true,
  district: true,
  city: true,
  state: true,
  countryCode: true,
} as const;

function toPrismaTimeFormat(value: TimeFormat): 'H24' | 'H12' {
  return value === '24H' ? 'H24' : 'H12';
}

function toTimeFormat(value: 'H24' | 'H12'): TimeFormat {
  return value === 'H24' ? '24H' : '12H';
}

function conflictFromTarget(target: unknown): TenantRepositoryConflictError {
  const normalizedTarget = JSON.stringify(target ?? '').toLowerCase();

  if (normalizedTarget.includes('headquarters')) {
    return new TenantRepositoryConflictError('HEADQUARTERS');
  }

  if (normalizedTarget.includes('business_units_tenant_id_slug')) {
    return new TenantRepositoryConflictError('BUSINESS_UNIT_SLUG');
  }

  if (normalizedTarget.includes('tenants_slug') || normalizedTarget === '["slug"]') {
    return new TenantRepositoryConflictError('TENANT_SLUG');
  }

  return new TenantRepositoryConflictError('UNIQUE_VALUE');
}

export class PrismaTenantRepository implements TenantRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async createTenant(input: CreateTenantPersistenceInput) {
    const safeSettings = TenantSettingsSchema.parse(input.settings);
    try {
      return await this.client.$transaction(
        async (transaction) => {
          const tenant = await transaction.tenant.create({
            data: {
              publicId: input.tenant.publicId,
              slug: input.tenant.slug,
              legalName: input.tenant.legalName,
              displayName: input.tenant.displayName,
              status: input.tenant.status,
              timezone: input.tenant.timezone,
              locale: input.tenant.locale,
              currency: input.tenant.currency,
            },
            select: {
              id: true,
              publicId: true,
              slug: true,
              displayName: true,
              status: true,
              timezone: true,
              locale: true,
              currency: true,
            },
          });

          const settingsRecord = await transaction.tenantSettings.create({
            data: {
              tenantId: tenant.id,
              allowMultipleUnits: safeSettings.allowMultipleUnits,
              defaultAppointmentIntervalMinutes: safeSettings.defaultAppointmentIntervalMinutes,
              minimumAdvanceMinutes: safeSettings.minimumAdvanceMinutes,
              maximumAdvanceDays: safeSettings.maximumAdvanceDays,
              weekStartsOn: safeSettings.weekStartsOn,
              dateFormat: safeSettings.dateFormat,
              timeFormat: toPrismaTimeFormat(safeSettings.timeFormat),
            },
            select: {
              allowMultipleUnits: true,
              defaultAppointmentIntervalMinutes: true,
              minimumAdvanceMinutes: true,
              maximumAdvanceDays: true,
              weekStartsOn: true,
              dateFormat: true,
              timeFormat: true,
            },
          });

          const initialUnit = await transaction.businessUnit.create({
            data: {
              publicId: input.initialUnit.publicId,
              tenantId: tenant.id,
              name: input.initialUnit.name,
              slug: input.initialUnit.slug,
              status: input.initialUnit.status,
              isHeadquarters: input.initialUnit.isHeadquarters,
              timezone: input.initialUnit.timezone,
              postalCode: input.initialUnit.postalCode,
              street: input.initialUnit.street,
              number: input.initialUnit.number,
              complement: input.initialUnit.complement,
              district: input.initialUnit.district,
              city: input.initialUnit.city,
              state: input.initialUnit.state,
              countryCode: input.initialUnit.countryCode,
            },
            select: {
              publicId: true,
              name: true,
              slug: true,
              status: true,
              isHeadquarters: true,
              timezone: true,
              postalCode: true,
              street: true,
              number: true,
              complement: true,
              district: true,
              city: true,
              state: true,
              countryCode: true,
            },
          });

          const publicTenant = TenantPublicSchema.parse({
            publicId: tenant.publicId,
            slug: tenant.slug,
            displayName: tenant.displayName,
            status: tenant.status,
            timezone: tenant.timezone,
            locale: tenant.locale,
            currency: tenant.currency,
          });
          const settings = TenantSettingsSchema.parse({
            ...settingsRecord,
            timeFormat: toTimeFormat(settingsRecord.timeFormat),
          });

          return {
            tenant: publicTenant,
            settings,
            initialUnit: BusinessUnitSchema.parse(initialUnit),
          };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflictFromTarget(error.meta?.target);
      }

      throw error;
    }
  }

  public async findTenantByPublicId(publicId: string): Promise<TenantRequestContext | null> {
    const tenant = await this.client.tenant.findUnique({
      where: { publicId },
      select: {
        id: true,
        publicId: true,
        slug: true,
        displayName: true,
        status: true,
        timezone: true,
        locale: true,
        currency: true,
      },
    });

    if (tenant === null) {
      return null;
    }

    const { id, ...publicTenant } = tenant;
    return { id, ...TenantPublicSchema.parse(publicTenant) };
  }

  public async listBusinessUnits(tenantId: bigint): Promise<BusinessUnit[]> {
    const units = await this.client.businessUnit.findMany({
      where: { tenantId },
      orderBy: [{ isHeadquarters: 'desc' }, { name: 'asc' }],
      select: businessUnitSelect,
    });

    return units.map((unit) => BusinessUnitSchema.parse(unit));
  }

  public async findBusinessUnit(tenantId: bigint, publicId: string): Promise<BusinessUnit | null> {
    const unit = await this.client.businessUnit.findFirst({
      where: { tenantId, publicId },
      select: businessUnitSelect,
    });

    return unit === null ? null : BusinessUnitSchema.parse(unit);
  }

  public async createBusinessUnit(
    tenantId: bigint,
    tenantTimezone: string,
    input: BusinessUnitInput,
  ): Promise<BusinessUnit> {
    try {
      const unit = await this.client.businessUnit.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: input.name,
          slug: input.slug,
          status: 'ACTIVE',
          isHeadquarters: false,
          timezone: input.timezone ?? tenantTimezone,
          postalCode: input.postalCode ?? null,
          street: input.street ?? null,
          number: input.number ?? null,
          complement: input.complement ?? null,
          district: input.district ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          countryCode: input.countryCode ?? null,
        },
        select: businessUnitSelect,
      });

      return BusinessUnitSchema.parse(unit);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflictFromTarget(error.meta?.target);
      }
      throw error;
    }
  }

  public async updateBusinessUnit(
    tenantId: bigint,
    publicId: string,
    tenantTimezone: string,
    input: BusinessUnitInput,
  ): Promise<BusinessUnit | null> {
    const existing = await this.client.businessUnit.findFirst({
      where: { tenantId, publicId },
      select: { id: true },
    });
    if (existing === null) return null;

    try {
      const unit = await this.client.businessUnit.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          slug: input.slug,
          timezone: input.timezone ?? tenantTimezone,
          postalCode: input.postalCode ?? null,
          street: input.street ?? null,
          number: input.number ?? null,
          complement: input.complement ?? null,
          district: input.district ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          countryCode: input.countryCode ?? null,
        },
        select: businessUnitSelect,
      });

      return BusinessUnitSchema.parse(unit);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflictFromTarget(error.meta?.target);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  public async setBusinessUnitStatus(
    tenantId: bigint,
    publicId: string,
    active: boolean,
  ): Promise<BusinessUnit | null> {
    const existing = await this.client.businessUnit.findFirst({
      where: { tenantId, publicId },
      select: { id: true },
    });
    if (existing === null) return null;

    const unit = await this.client.businessUnit.update({
      where: { id: existing.id },
      data: { status: active ? 'ACTIVE' : 'INACTIVE' },
      select: businessUnitSelect,
    });

    return BusinessUnitSchema.parse(unit);
  }

  public async setHeadquarters(tenantId: bigint, publicId: string): Promise<BusinessUnit | null> {
    const target = await this.client.businessUnit.findFirst({
      where: { tenantId, publicId },
      select: { id: true },
    });
    if (target === null) return null;

    const unit = await this.client.$transaction(async (transaction) => {
      await transaction.businessUnit.updateMany({
        where: { tenantId, isHeadquarters: true },
        data: { isHeadquarters: false },
      });
      return transaction.businessUnit.update({
        where: { id: target.id },
        data: { isHeadquarters: true },
        select: businessUnitSelect,
      });
    });

    return BusinessUnitSchema.parse(unit);
  }

  public async countActiveBusinessUnits(tenantId: bigint): Promise<number> {
    return this.client.businessUnit.count({ where: { tenantId, status: 'ACTIVE' } });
  }

  public async auditBusinessUnit(entry: BusinessUnitAuditEntry): Promise<void> {
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId: entry.tenantId,
        userId: entry.userId,
        sessionId: entry.sessionId,
        action: entry.action,
        targetType: 'business_unit',
        targetPublicId: entry.targetPublicId,
      },
    });
  }

  public async findSettings(tenantId: bigint): Promise<TenantSettings | null> {
    const settings = await this.client.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        allowMultipleUnits: true,
        defaultAppointmentIntervalMinutes: true,
        minimumAdvanceMinutes: true,
        maximumAdvanceDays: true,
        weekStartsOn: true,
        dateFormat: true,
        timeFormat: true,
      },
    });

    return settings === null
      ? null
      : TenantSettingsSchema.parse({
          ...settings,
          timeFormat: toTimeFormat(settings.timeFormat),
        });
  }

  public async updateSettings(
    tenantId: bigint,
    settings: TenantSettings,
  ): Promise<TenantSettings | null> {
    const safeSettings = TenantSettingsSchema.parse(settings);
    try {
      const updated = await this.client.tenantSettings.update({
        where: { tenantId },
        data: {
          allowMultipleUnits: safeSettings.allowMultipleUnits,
          defaultAppointmentIntervalMinutes: safeSettings.defaultAppointmentIntervalMinutes,
          minimumAdvanceMinutes: safeSettings.minimumAdvanceMinutes,
          maximumAdvanceDays: safeSettings.maximumAdvanceDays,
          weekStartsOn: safeSettings.weekStartsOn,
          dateFormat: safeSettings.dateFormat,
          timeFormat: toPrismaTimeFormat(safeSettings.timeFormat),
        },
        select: {
          allowMultipleUnits: true,
          defaultAppointmentIntervalMinutes: true,
          minimumAdvanceMinutes: true,
          maximumAdvanceDays: true,
          weekStartsOn: true,
          dateFormat: true,
          timeFormat: true,
        },
      });

      return TenantSettingsSchema.parse({
        ...updated,
        timeFormat: toTimeFormat(updated.timeFormat),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
