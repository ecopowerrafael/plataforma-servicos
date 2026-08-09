import {
  type BusinessUnit,
  type BusinessUnitInput,
  type CreateTenantResponse,
  type TenantPublic,
  type TenantSettings,
} from '@plataforma/shared';

export interface TenantRequestContext extends TenantPublic {
  id: bigint;
}

export interface CreateTenantPersistenceInput {
  tenant: TenantPublic & { legalName: string };
  settings: TenantSettings;
  initialUnit: BusinessUnit;
}

export type TenantRepositoryConflict =
  'TENANT_SLUG' | 'BUSINESS_UNIT_SLUG' | 'HEADQUARTERS' | 'UNIQUE_VALUE';

export class TenantRepositoryConflictError extends Error {
  public constructor(public readonly conflict: TenantRepositoryConflict) {
    super('A estrutura multiempresa possui um valor único já utilizado.');
    this.name = 'TenantRepositoryConflictError';
  }
}

export interface BusinessUnitAuditEntry {
  tenantId: bigint;
  userId: bigint;
  sessionId: bigint;
  action: string;
  targetPublicId: string;
}

export interface TenantRepository {
  createTenant(input: CreateTenantPersistenceInput): Promise<CreateTenantResponse>;
  findTenantByPublicId(publicId: string): Promise<TenantRequestContext | null>;
  listBusinessUnits(tenantId: bigint): Promise<BusinessUnit[]>;
  findBusinessUnit(tenantId: bigint, publicId: string): Promise<BusinessUnit | null>;
  createBusinessUnit(
    tenantId: bigint,
    tenantTimezone: string,
    input: BusinessUnitInput,
  ): Promise<BusinessUnit>;
  updateBusinessUnit(
    tenantId: bigint,
    publicId: string,
    tenantTimezone: string,
    input: BusinessUnitInput,
  ): Promise<BusinessUnit | null>;
  setBusinessUnitStatus(
    tenantId: bigint,
    publicId: string,
    active: boolean,
  ): Promise<BusinessUnit | null>;
  setHeadquarters(tenantId: bigint, publicId: string): Promise<BusinessUnit | null>;
  countActiveBusinessUnits(tenantId: bigint): Promise<number>;
  findSettings(tenantId: bigint): Promise<TenantSettings | null>;
  updateSettings(tenantId: bigint, settings: TenantSettings): Promise<TenantSettings | null>;
  auditBusinessUnit(entry: BusinessUnitAuditEntry): Promise<void>;
}
