import { readFileSync } from 'node:fs';

import { BusinessProfileLabels, TenantSlugSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import {
  contrastTextColor,
  deriveBrandPalette,
} from '../../../../web/src/components/branding/brand-studio.js';

const routesSource = readFileSync(new URL('./tenant.routes.ts', import.meta.url), 'utf8');
const identityServiceSource = readFileSync(
  new URL('./tenant-identity.service.ts', import.meta.url),
  'utf8',
);
const repositorySource = readFileSync(
  new URL('./tenant-white-label.repository.ts', import.meta.url),
  'utf8',
);
const serviceSource = readFileSync(
  new URL('./tenant-white-label.service.ts', import.meta.url),
  'utf8',
);
const imageStorageSource = readFileSync(
  new URL('../services/service-image.storage.ts', import.meta.url),
  'utf8',
);
const homeSource = readFileSync(
  new URL('../../../../web/src/routes/HomePage.tsx', import.meta.url),
  'utf8',
);
const publicPageSource = readFileSync(
  new URL('../../../../web/src/routes/PublicTenantPage.tsx', import.meta.url),
  'utf8',
);
const stylesSource = readFileSync(
  new URL('../../../../web/src/styles.css', import.meta.url),
  'utf8',
);
const brandStudioSource = readFileSync(
  new URL('../../../../web/src/components/tenants/WhiteLabelModule.tsx', import.meta.url),
  'utf8',
);
const bannersSource = readFileSync(
  new URL('../../../../web/src/components/tenants/BannersModule.tsx', import.meta.url),
  'utf8',
);

describe('tenant Brand Studio contracts', () => {
  it('presents every existing business profile in Portuguese', () => {
    expect(BusinessProfileLabels.BARBERSHOP).toBe('Barbearia');
    expect(BusinessProfileLabels.DENTISTRY).toBe('Clínica odontológica');
    expect(BusinessProfileLabels.PET_CARE).toBe('Pet shop / Banho e tosa');
    expect(Object.values(BusinessProfileLabels)).not.toContain('DENTISTRY');
  });

  it('normalizes and rejects reserved tenant slugs', () => {
    expect(TenantSlugSchema.parse('Minha-Marca')).toBe('minha-marca');
    expect(TenantSlugSchema.safeParse('app').success).toBe(false);
  });

  it('enforces the single slug change atomically for the owner', () => {
    expect(routesSource).toContain('membership.isOwner');
    expect(identityServiceSource).toContain('slugChangedAt: null');
    expect(identityServiceSource).toContain('TENANT_SLUG_CHANGE_ALREADY_USED');
    expect(identityServiceSource).toContain('PrismaClientKnownRequestError');
  });

  it('derives accessible theme tokens instead of painting every surface equally', () => {
    const palette = deriveBrandPalette('#2457D6');
    expect(palette.primaryColor).toBe('#2457D6');
    expect(palette.secondaryColor).not.toBe(palette.primaryColor);
    expect(palette.backgroundColor).not.toBe(palette.primaryColor);
    expect(palette.surfaceColor).toBe('#FFFFFF');
    expect(palette.textColor).toBe('#0F172A');
    expect(contrastTextColor('#FFFFFF')).toBe('#0F172A');
    expect(contrastTextColor('#111827')).toBe('#FFFFFF');
  });

  it('persists theme, color, splash and PWA icon through existing tenant endpoints', () => {
    expect(brandStudioSource).toContain("'/tenant/branding'");
    expect(brandStudioSource).toContain("'/tenant/public-site'");
    expect(brandStudioSource).toContain("kind: 'SPLASH'");
    expect(brandStudioSource).toContain("kind: 'APP_ICON'");
  });

  it('keeps uploads isolated by tenant and validates real image content', () => {
    expect(repositorySource).toContain('where: { tenantId, publicId, deletedAt: null }');
    expect(repositorySource).toContain('where: { tenantId, kind, deletedAt: null }');
    expect(serviceSource).toContain('this.storage.save(tenant.publicId, publicId, image)');
    expect(imageStorageSource).toContain("'SERVICE_IMAGE_TYPE_INVALID'");
    expect(imageStorageSource).toContain('serviceImageMaxBytes()');
  });

  it('manages responsive banners with real media assets', () => {
    expect(bannersSource).toContain("'BANNER_DESKTOP'");
    expect(bannersSource).toContain("'BANNER_MOBILE'");
    expect(bannersSource).toContain('/tenant/media/');
    expect(publicPageSource).toContain("asset('BANNER_MOBILE')");
    expect(stylesSource).toContain('var(--tenant-banner-desktop)');
    expect(stylesSource).toContain('var(--tenant-banner-mobile)');
  });

  it('applies identity to the public page and PWA manifest', () => {
    expect(publicPageSource).toContain('site.data.displayName');
    expect(publicPageSource).toContain("asset.kind === 'FAVICON' || asset.kind === 'APP_ICON'");
    expect(publicPageSource).toContain("'--tenant-primary'");
    expect(serviceSource).toContain('theme_color: site.branding.primaryColor');
    expect(serviceSource).toContain('name: site.site.pwaName ?? site.displayName');
  });

  it('reuses Brand Studio controls during onboarding', () => {
    expect(homeSource).toContain('<BrandAssetDropzone');
    expect(homeSource).toContain('<BrandThemePicker');
    expect(homeSource).toContain('<BrandColorPicker');
    expect(homeSource).toContain("navigate('/app/servicos')");
    expect(homeSource).toContain("BUSINESS_ADDRESS: 'BUSINESS_IDENTITY'");
    expect(homeSource).toContain('Seu espaço está ficando com a sua cara.');
    expect(homeSource).toContain('Cadastrar meus serviços');
  });

  it('renders three compositionally distinct public themes', () => {
    expect(stylesSource).toContain('.public-theme-classic .public-hero');
    expect(stylesSource).toContain('.public-theme-premium .public-hero h1');
    expect(stylesSource).toContain('.public-theme-modern .public-cards article:hover');
    expect(stylesSource).toContain("font-family: Georgia, 'Times New Roman', serif");
  });
});
