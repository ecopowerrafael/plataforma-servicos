import { describe, expect, it } from 'vitest';
import { normalizeOperatingModel } from './operating-model.js';
import { TenantPublicSchema } from './tenant.js';

describe('operating model compatibility', () => {
  it('normalizes only missing legacy values to the historical model', () => {
    expect(normalizeOperatingModel(null)).toBe('SERVICE_PRICING');
    expect(normalizeOperatingModel(undefined)).toBe('SERVICE_PRICING');
    expect(() => normalizeOperatingModel('SERVICE')).toThrow();
  });

  it('normalizes a legacy Tenant response without weakening invalid values', () => {
    const tenant = TenantPublicSchema.parse({
      publicId: '00000000-0000-4000-8000-000000000001', slug: 'legacy', displayName: 'Legacy',
      status: 'ACTIVE', timezone: 'America/Sao_Paulo', locale: 'pt-BR', currency: 'BRL', operatingModel: null,
    });
    expect(tenant.operatingModel).toBe('SERVICE_PRICING');
    expect(() => TenantPublicSchema.parse({ ...tenant, operatingModel: 'SERVICE' })).toThrow();
  });
});
