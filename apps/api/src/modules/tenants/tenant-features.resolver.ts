import {
  BusinessProfileCatalog,
  TenantFeatureCodeSchema,
  type TenantFeatureCode,
} from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';

interface TenantFeatureRecord {
  businessProfile: keyof typeof BusinessProfileCatalog;
  featureOverrides: { code: string; enabled: boolean; source: 'PROFILE' | 'OVERRIDE' }[];
}

export function resolveTenantFeatures(tenant: TenantFeatureRecord) {
  const recommended = new Set(BusinessProfileCatalog[tenant.businessProfile].recommendedFeatures);
  const overrides = new Map(
    tenant.featureOverrides
      .filter(
        (override): override is { code: TenantFeatureCode; enabled: boolean; source: 'OVERRIDE' } =>
          override.source === 'OVERRIDE' &&
          TenantFeatureCodeSchema.safeParse(override.code).success,
      )
      .map((override) => [override.code, override.enabled]),
  );
  return {
    profile: tenant.businessProfile,
    features: TenantFeatureCodeSchema.options.map((code) => {
      const defaultEnabled = recommended.has(code);
      const override = overrides.get(code);
      return {
        code,
        recommended: defaultEnabled,
        enabled: override ?? defaultEnabled,
        source: override === undefined ? ('PROFILE' as const) : ('OVERRIDE' as const),
      };
    }),
  };
}

export class TenantFeaturesResolver {
  public constructor(private readonly client: PrismaClient) {}

  public async findByTenantPublicId(tenantPublicId: string) {
    const tenant = await this.client.tenant.findUnique({
      where: { publicId: tenantPublicId },
      include: { featureOverrides: true },
    });
    return tenant === null ? null : resolveTenantFeatures(tenant);
  }
}
