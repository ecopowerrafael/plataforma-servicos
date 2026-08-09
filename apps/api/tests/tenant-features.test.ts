import {
  BusinessProfileCatalog,
  TenantFeaturesResponseSchema,
  UpdateTenantFeaturesRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import { resolveTenantFeatures } from '../src/modules/tenants/tenant-features.resolver.js';

describe('funcionalidades efetivas por tenant', () => {
  it('resolve os defaults recomendados do perfil', () => {
    const result = resolveTenantFeatures({
      businessProfile: 'PSYCHOLOGY',
      featureOverrides: [{ code: 'MEDICAL_RECORDS', enabled: true, source: 'PROFILE' }],
    });
    const medicalRecords = result.features.find((feature) => feature.code === 'MEDICAL_RECORDS');
    expect(medicalRecords).toEqual({
      code: 'MEDICAL_RECORDS',
      recommended: true,
      enabled: true,
      source: 'PROFILE',
    });
    expect(TenantFeaturesResponseSchema.safeParse(result).success).toBe(true);
  });

  it('mant\u00e9m o fallback GENERIC sem funcionalidades recomendadas', () => {
    const result = resolveTenantFeatures({ businessProfile: 'GENERIC', featureOverrides: [] });
    expect(BusinessProfileCatalog.GENERIC.recommendedFeatures).toEqual([]);
    expect(
      result.features.every((feature) => !feature.enabled && feature.source === 'PROFILE'),
    ).toBe(true);
  });

  it('aplica override individual sem vazar para outro tenant', () => {
    const overridden = resolveTenantFeatures({
      businessProfile: 'BARBERSHOP',
      featureOverrides: [{ code: 'CUSTOMER_SELF_BOOKING', enabled: false, source: 'OVERRIDE' }],
    });
    const isolated = resolveTenantFeatures({ businessProfile: 'BARBERSHOP', featureOverrides: [] });
    expect(
      overridden.features.find((feature) => feature.code === 'CUSTOMER_SELF_BOOKING'),
    ).toMatchObject({
      enabled: false,
      source: 'OVERRIDE',
    });
    expect(
      isolated.features.find((feature) => feature.code === 'CUSTOMER_SELF_BOOKING'),
    ).toMatchObject({
      enabled: true,
      source: 'PROFILE',
    });
  });

  it('rejeita chave desconhecida, duplicidade e valor inv\u00e1lido', () => {
    expect(
      UpdateTenantFeaturesRequestSchema.safeParse({
        features: [{ code: 'UNKNOWN_FEATURE', enabled: true }],
      }).success,
    ).toBe(false);
    expect(
      UpdateTenantFeaturesRequestSchema.safeParse({
        features: [
          { code: 'MULTIPLE_UNITS', enabled: true },
          { code: 'MULTIPLE_UNITS', enabled: false },
        ],
      }).success,
    ).toBe(false);
    expect(
      UpdateTenantFeaturesRequestSchema.safeParse({
        features: [{ code: 'MULTIPLE_UNITS', enabled: 'true' }],
      }).success,
    ).toBe(false);
  });
});
