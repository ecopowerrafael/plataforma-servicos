import { randomUUID } from 'node:crypto';

import {
  type BusinessUnit,
  type BusinessUnitInput,
  type CreateTenantResponse,
  type TenantSettings,
} from '@plataforma/shared';

import {
  type BusinessUnitAuditEntry,
  type CreateTenantPersistenceInput,
  type TenantRepository,
  TenantRepositoryConflictError,
  type TenantRequestContext,
} from '../../src/modules/tenants/tenant.repository.js';

interface StoredTenant {
  context: TenantRequestContext;
  settings: TenantSettings;
  units: BusinessUnit[];
}

export class InMemoryTenantRepository implements TenantRepository {
  private readonly tenants: StoredTenant[] = [];
  private nextId = 1n;
  public failBeforeCommit = false;
  public auditEntries: BusinessUnitAuditEntry[] = [];

  public get counts() {
    return {
      tenants: this.tenants.length,
      settings: this.tenants.length,
      units: this.tenants.reduce((total, tenant) => total + tenant.units.length, 0),
    };
  }

  public seed(
    context: TenantRequestContext,
    settings: TenantSettings,
    units: BusinessUnit[],
  ): void {
    this.tenants.push({ context, settings, units });
    if (context.id >= this.nextId) this.nextId = context.id + 1n;
  }

  public createTenant(input: CreateTenantPersistenceInput): Promise<CreateTenantResponse> {
    if (this.tenants.some(({ context }) => context.slug === input.tenant.slug)) {
      throw new TenantRepositoryConflictError('TENANT_SLUG');
    }

    const publicTenant = {
      publicId: input.tenant.publicId,
      slug: input.tenant.slug,
      displayName: input.tenant.displayName,
      status: input.tenant.status,
      timezone: input.tenant.timezone,
      locale: input.tenant.locale,
      currency: input.tenant.currency,
    };
    const initialUnit = structuredClone(input.initialUnit);
    const staged: StoredTenant = {
      context: { id: this.nextId, ...publicTenant },
      settings: structuredClone(input.settings),
      units: [initialUnit],
    };

    if (this.failBeforeCommit) throw new Error('controlled transaction failure');

    this.nextId += 1n;
    this.tenants.push(staged);
    return Promise.resolve({
      tenant: publicTenant,
      settings: staged.settings,
      initialUnit,
    });
  }

  public findTenantByPublicId(publicId: string): Promise<TenantRequestContext | null> {
    return Promise.resolve(
      this.tenants.find(({ context }) => context.publicId === publicId)?.context ?? null,
    );
  }

  public listBusinessUnits(tenantId: bigint): Promise<BusinessUnit[]> {
    return Promise.resolve(
      this.tenants.find(({ context }) => context.id === tenantId)?.units ?? [],
    );
  }

  public findSettings(tenantId: bigint): Promise<TenantSettings | null> {
    return Promise.resolve(
      this.tenants.find(({ context }) => context.id === tenantId)?.settings ?? null,
    );
  }

  public updateSettings(
    tenantId: bigint,
    settings: TenantSettings,
  ): Promise<TenantSettings | null> {
    const stored = this.tenants.find(({ context }) => context.id === tenantId);
    if (stored === undefined) return Promise.resolve(null);

    stored.settings = structuredClone(settings);
    return Promise.resolve(structuredClone(stored.settings));
  }

  public findBusinessUnit(tenantId: bigint, publicId: string): Promise<BusinessUnit | null> {
    const stored = this.tenants.find(({ context }) => context.id === tenantId);
    const unit = stored?.units.find((candidate) => candidate.publicId === publicId) ?? null;
    return Promise.resolve(unit === null ? null : structuredClone(unit));
  }

  public createBusinessUnit(
    tenantId: bigint,
    tenantTimezone: string,
    input: BusinessUnitInput,
  ): Promise<BusinessUnit> {
    const stored = this.tenants.find(({ context }) => context.id === tenantId);
    if (stored === undefined) {
      throw new TenantRepositoryConflictError('UNIQUE_VALUE');
    }
    if (stored.units.some((unit) => unit.slug === input.slug)) {
      throw new TenantRepositoryConflictError('BUSINESS_UNIT_SLUG');
    }

    const unit: BusinessUnit = {
      publicId: randomUUID(),
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
    };
    stored.units.push(unit);
    return Promise.resolve(structuredClone(unit));
  }

  public updateBusinessUnit(
    tenantId: bigint,
    publicId: string,
    tenantTimezone: string,
    input: BusinessUnitInput,
  ): Promise<BusinessUnit | null> {
    const stored = this.tenants.find(({ context }) => context.id === tenantId);
    const unit = stored?.units.find((candidate) => candidate.publicId === publicId);
    if (stored === undefined || unit === undefined) return Promise.resolve(null);
    if (stored.units.some((candidate) => candidate.slug === input.slug && candidate !== unit)) {
      throw new TenantRepositoryConflictError('BUSINESS_UNIT_SLUG');
    }

    unit.name = input.name;
    unit.slug = input.slug;
    unit.timezone = input.timezone ?? tenantTimezone;
    unit.postalCode = input.postalCode ?? null;
    unit.street = input.street ?? null;
    unit.number = input.number ?? null;
    unit.complement = input.complement ?? null;
    unit.district = input.district ?? null;
    unit.city = input.city ?? null;
    unit.state = input.state ?? null;
    unit.countryCode = input.countryCode ?? null;
    return Promise.resolve(structuredClone(unit));
  }

  public setBusinessUnitStatus(
    tenantId: bigint,
    publicId: string,
    active: boolean,
  ): Promise<BusinessUnit | null> {
    const stored = this.tenants.find(({ context }) => context.id === tenantId);
    const unit = stored?.units.find((candidate) => candidate.publicId === publicId);
    if (unit === undefined) return Promise.resolve(null);

    unit.status = active ? 'ACTIVE' : 'INACTIVE';
    return Promise.resolve(structuredClone(unit));
  }

  public setHeadquarters(tenantId: bigint, publicId: string): Promise<BusinessUnit | null> {
    const stored = this.tenants.find(({ context }) => context.id === tenantId);
    const unit = stored?.units.find((candidate) => candidate.publicId === publicId);
    if (stored === undefined || unit === undefined) return Promise.resolve(null);

    for (const candidate of stored.units) candidate.isHeadquarters = false;
    unit.isHeadquarters = true;
    return Promise.resolve(structuredClone(unit));
  }

  public countActiveBusinessUnits(tenantId: bigint): Promise<number> {
    const stored = this.tenants.find(({ context }) => context.id === tenantId);
    return Promise.resolve(
      stored === undefined ? 0 : stored.units.filter((unit) => unit.status === 'ACTIVE').length,
    );
  }

  public auditBusinessUnit(entry: BusinessUnitAuditEntry): Promise<void> {
    this.auditEntries.push(entry);
    return Promise.resolve();
  }
}
