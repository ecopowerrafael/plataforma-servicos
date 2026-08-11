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
      branding: true,
      terminology: true,
      publicSite: true,
    });
    expect(input.select).not.toHaveProperty('slugChangedAt');
    expect(input.select).not.toHaveProperty('businessTypeCustom');
  });
});
