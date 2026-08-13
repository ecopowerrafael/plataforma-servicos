import { TenantPublicSiteSchema, UpdateTenantPublicSiteRequestSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import { SERVICE_ICON_KEYS, serviceIcon } from './service-icons.js';
import { deriveBrandPalette, PUBLIC_LAYOUTS } from '../branding/brand-studio.js';

const site = {
  theme: 'CLASSIC',
  layout: 'CLASSIC',
  heroTitle: null,
  heroSubtitle: null,
  aboutText: null,
  primaryCallToAction: null,
  footerText: null,
  seoTitle: null,
  seoDescription: null,
  pwaName: null,
  pwaShortName: null,
  pwaDescription: null,
};

describe('modelo e tema do app público', () => {
  it('mantém o modelo clássico como padrão do tenant existente', () => {
    expect(TenantPublicSiteSchema.parse(site).layout).toBe('CLASSIC');
    expect(PUBLIC_LAYOUTS[0].code).toBe('CLASSIC');
  });

  it('permite trocar o modelo sem alterar o tema, e vice-versa', () => {
    const onlyLayout = UpdateTenantPublicSiteRequestSchema.parse({ layout: 'PREMIUM_APP' });
    expect(onlyLayout).toEqual({ layout: 'PREMIUM_APP' });
    const onlyTheme = UpdateTenantPublicSiteRequestSchema.parse({ theme: 'LUXURY' });
    expect(onlyTheme).toEqual({ theme: 'LUXURY' });
    expect(
      TenantPublicSiteSchema.parse({ ...site, theme: 'LUXURY', layout: 'PREMIUM_APP' }),
    ).toMatchObject({ theme: 'LUXURY', layout: 'PREMIUM_APP' });
  });

  it('recusa modelo desconhecido', () => {
    expect(UpdateTenantPublicSiteRequestSchema.safeParse({ layout: 'NEON' }).success).toBe(false);
  });

  it('deriva paleta escura apenas no tema Luxury', () => {
    expect(deriveBrandPalette('#C79A5B', 'LUXURY').backgroundColor).toBe('#0B0B0C');
    expect(deriveBrandPalette('#2457D6').surfaceColor).toBe('#FFFFFF');
  });
});

describe('catálogo curado de ícones de serviço', () => {
  it('resolve apenas chaves conhecidas', () => {
    expect(serviceIcon('scissors')).not.toBeNull();
    expect(serviceIcon('não-existe')).toBeNull();
    expect(serviceIcon(null)).toBeNull();
  });

  it('mantém a lista enxuta e sem chaves repetidas', () => {
    expect(new Set(SERVICE_ICON_KEYS).size).toBe(SERVICE_ICON_KEYS.length);
    expect(SERVICE_ICON_KEYS.length).toBeLessThanOrEqual(30);
  });
});
