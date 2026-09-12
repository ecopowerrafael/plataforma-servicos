import { describe, expect, it, vi } from 'vitest';

import { TenantWhiteLabelRepository } from './tenant-white-label.repository.js';

describe('TenantWhiteLabelRepository', () => {
  it('loads only legacy-compatible fields for the authenticated white-label GET', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const repository = new TenantWhiteLabelRepository({
      tenant: { findUnique },
    } as never);

    await repository.findTenant(41n);

    const input = findUnique.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(input.select).toMatchObject({
      id: true,
      publicId: true,
      slug: true,
      displayName: true,
      businessProfile: true,
      branding: { select: { primaryColor: true, splashUrl: true } },
      terminology: { select: { professionalSingular: true, unitPlural: true } },
      publicSite: { select: { theme: true, pwaDescription: true } },
    });
    expect(input.select).not.toHaveProperty('slugChangedAt');
    expect(input.select).not.toHaveProperty('businessTypeCustom');
    expect(input.select.branding).not.toHaveProperty('select.createdAt');
    expect(input.select.publicSite).not.toHaveProperty('select.updatedAt');
  });

  it('selects only public-site columns accepted by the strict public response schema', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new TenantWhiteLabelRepository({
      tenant: { findFirst },
    } as never);

    await repository.findPublicTenant('barbearia-silva');

    const input = findFirst.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    const publicSite = input.select.publicSite as { select: Record<string, unknown> };
    expect(publicSite.select).toMatchObject({
      theme: true,
      heroTitle: true,
      heroSubtitle: true,
      aboutText: true,
      primaryCallToAction: true,
    });
    expect(publicSite.select).not.toHaveProperty('id');
    expect(publicSite.select).not.toHaveProperty('tenantId');
    expect(publicSite.select).not.toHaveProperty('createdAt');
    expect(publicSite.select).not.toHaveProperty('updatedAt');
  });

  it('returns only public fields after updating the site during onboarding', async () => {
    const upsert = vi.fn().mockResolvedValue(null);
    const repository = new TenantWhiteLabelRepository({ tenantPublicSite: { upsert } } as never);

    await repository.upsertSite(41n, { tenantId: 41n, theme: 'MODERN' });

    const input = upsert.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(input.select).toMatchObject({ theme: true, heroTitle: true, pwaDescription: true });
    expect(input.select).not.toHaveProperty('id');
    expect(input.select).not.toHaveProperty('tenantId');
    expect(input.select).not.toHaveProperty('createdAt');
    expect(input.select).not.toHaveProperty('updatedAt');
  });
});
