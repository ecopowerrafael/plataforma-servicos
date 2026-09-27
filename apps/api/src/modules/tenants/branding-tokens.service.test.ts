import { describe, expect, it, vi } from 'vitest';

import { resolveTenantExperience } from './tenant-experience.resolver.js';
import { TenantWhiteLabelService } from './tenant-white-label.service.js';

import type { TenantMediaStorage } from './tenant-media.storage.js';
import type { TenantWhiteLabelRepository } from './tenant-white-label.repository.js';

const SEMANTIC_KEYS = [
  'onPrimaryColor',
  'headerColor',
  'headerTextColor',
  'navigationColor',
  'activeColor',
] as const;

/** Branding de um tenant criado antes da migration: sem os campos novos. */
const legacyBranding = {
  useProfileDefaults: false,
  primaryColor: '#2457D6',
  secondaryColor: '#1B419F',
  accentColor: '#4F78DE',
  backgroundColor: '#F6F8FD',
  surfaceColor: '#FFFFFF',
  textColor: '#0F172A',
  mutedTextColor: '#64748B',
  borderColor: '#D5DDF4',
  borderRadius: '0.75rem',
  fontFamily: 'Inter',
  logoUrl: null,
  faviconUrl: null,
  bannerUrl: null,
  pwaIconUrl: null,
  splashUrl: null,
};

function buildService(branding: Record<string, unknown> | null) {
  const upsertBranding = vi.fn().mockResolvedValue({});
  const tenant = {
    id: 1n,
    publicId: '9b7f0f4a-0f2b-4a1e-9a3e-9d9a1b2c3d4e',
    slug: 'barbearia',
    displayName: 'Barbearia',
    businessProfile: 'BARBERSHOP' as const,
    status: 'ACTIVE',
    onboardingCompletedAt: null,
    branding,
    terminology: null,
    publicSite: null,
  };
  const repository = {
    findTenant: vi.fn().mockResolvedValue(tenant),
    listAssets: vi.fn().mockResolvedValue([]),
    upsertBranding,
    recordAudit: vi.fn().mockResolvedValue(undefined),
    findPwaState: vi.fn().mockResolvedValue({ status: 'DRAFT', publishedAt: null }),
  } as unknown as TenantWhiteLabelRepository;
  const service = new TenantWhiteLabelService(
    repository,
    {} as TenantMediaStorage,
    {} as never,
    {} as never,
  );
  return { service, upsertBranding };
}

describe('tokens semânticos da marca', () => {
  it('tenant legado mantém a aparência anterior com os campos nulos', () => {
    const experience = resolveTenantExperience({
      businessProfile: 'BARBERSHOP',
      branding: legacyBranding,
      terminology: null,
    });

    for (const key of SEMANTIC_KEYS) expect(experience.branding[key]).toBeNull();
    // As cores base seguem exatamente como estavam.
    expect(experience.branding.primaryColor).toBe('#2457D6');
    expect(experience.branding.surfaceColor).toBe('#FFFFFF');
  });

  it('devolve os tokens quando o tenant os escolheu', () => {
    const experience = resolveTenantExperience({
      businessProfile: 'BARBERSHOP',
      branding: {
        ...legacyBranding,
        onPrimaryColor: '#FFFFFF',
        headerColor: '#101014',
        headerTextColor: '#F5F1E8',
        navigationColor: '#141416',
        activeColor: '#C9A227',
      },
      terminology: null,
    });

    expect(experience.branding.headerColor).toBe('#101014');
    expect(experience.branding.activeColor).toBe('#C9A227');
  });

  it('persiste os cinco tokens no PATCH de branding', async () => {
    const { service, upsertBranding } = buildService(legacyBranding);
    await service.updateBranding(
      1n,
      {
        primaryColor: '#0F766E',
        onPrimaryColor: '#FFFFFF',
        headerColor: '#0F766E',
        headerTextColor: '#FFFFFF',
        navigationColor: '#0B3B37',
        activeColor: '#5EEAD4',
      },
      { userId: 1n, sessionId: 1n },
    );

    expect(upsertBranding).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({
        primaryColor: '#0F766E',
        onPrimaryColor: '#FFFFFF',
        headerColor: '#0F766E',
        headerTextColor: '#FFFFFF',
        navigationColor: '#0B3B37',
        activeColor: '#5EEAD4',
      }),
    );
  });

  it('não inventa valor para quem nunca escolheu os tokens', async () => {
    const { service, upsertBranding } = buildService(legacyBranding);
    await service.updateBranding(1n, { primaryColor: '#111827' }, { userId: 1n, sessionId: 1n });

    const payload = upsertBranding.mock.calls[0]?.[1] as Record<string, unknown>;
    for (const key of SEMANTIC_KEYS) expect(payload[key]).toBeNull();
  });
});
