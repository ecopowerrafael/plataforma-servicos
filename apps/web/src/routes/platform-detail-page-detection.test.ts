import { describe, expect, it } from 'vitest';

import { isPlatformDetailPath } from '../lib/platform-route-detection.js';

describe('Platform Detail Page Detection', () => {
  it('professionals/:professionalPublicId → true', () => {
    const pathname = '/platform/tenants/abc-123/professionals/prof-456';
    expect(isPlatformDetailPath(pathname)).toBe(true);
  });

  it('services/:servicePublicId → true', () => {
    const pathname = '/platform/tenants/abc-123/services/svc-789';
    expect(isPlatformDetailPath(pathname)).toBe(true);
  });

  it('combos/:comboPublicId → true', () => {
    const pathname = '/platform/tenants/abc-123/combos/combo-101';
    expect(isPlatformDetailPath(pathname)).toBe(true);
  });

  it('tenant base (/platform/tenants/:tenantPublicId) → false', () => {
    const pathname = '/platform/tenants/abc-123';
    expect(isPlatformDetailPath(pathname)).toBe(false);
  });

  it('tenants list (/platform/tenants) → false', () => {
    const pathname = '/platform/tenants';
    expect(isPlatformDetailPath(pathname)).toBe(false);
  });

  it('dashboard (/platform) → false', () => {
    const pathname = '/platform';
    expect(isPlatformDetailPath(pathname)).toBe(false);
  });

  it('other section (/platform/plans) → false', () => {
    const pathname = '/platform/plans';
    expect(isPlatformDetailPath(pathname)).toBe(false);
  });

  it('plan detail (/platform/plans/:planId) uses different route → false', () => {
    const pathname = '/platform/plans/plan-999';
    expect(isPlatformDetailPath(pathname)).toBe(false);
  });
});
