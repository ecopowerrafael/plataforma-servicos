import {
  BusinessProfileCatalog,
  TenantExperienceResponseSchema,
  UpdateTenantBrandingRequestSchema,
  UpdateTenantTerminologyRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import { resolveTenantExperience } from '../src/modules/tenants/tenant-experience.resolver.js';

const defaultBranding = {
  useProfileDefaults: true,
  primaryColor: '#000000',
  secondaryColor: '#000000',
  accentColor: '#000000',
  backgroundColor: '#000000',
  surfaceColor: '#000000',
  textColor: '#000000',
  mutedTextColor: '#000000',
  borderColor: '#000000',
  borderRadius: '0.25rem',
  fontFamily: 'Inter',
  logoUrl: null,
  faviconUrl: null,
  bannerUrl: null,
  pwaIconUrl: null,
  splashUrl: null,
};

describe('experi\u00eancia persistida por tenant', () => {
  it('resolve os defaults do perfil e o fallback GENERIC', () => {
    const experience = resolveTenantExperience({
      businessProfile: 'GENERIC',
      branding: null,
      terminology: null,
    });
    expect(experience.profile).toBe('GENERIC');
    expect(experience.branding.primaryColor).toBe(
      BusinessProfileCatalog.GENERIC.theme.primaryColor,
    );
    expect(experience.terminology).toEqual(BusinessProfileCatalog.GENERIC.terminology);
    expect(TenantExperienceResponseSchema.safeParse(experience).success).toBe(true);
  });

  it('aplica branding e overrides de terminologia sem vazar para outro tenant', () => {
    const customized = resolveTenantExperience({
      businessProfile: 'PSYCHOLOGY',
      branding: { ...defaultBranding, useProfileDefaults: false, primaryColor: '#123456' },
      terminology: { customerSingular: 'Pessoa atendida', appointmentPlural: 'Encontros' },
    });
    const isolated = resolveTenantExperience({
      businessProfile: 'PSYCHOLOGY',
      branding: null,
      terminology: null,
    });
    expect(customized.branding.primaryColor).toBe('#123456');
    expect(customized.terminology.customer.singular).toBe('Pessoa atendida');
    expect(customized.terminology.appointment.plural).toBe('Encontros');
    expect(isolated.branding.primaryColor).toBe(
      BusinessProfileCatalog.PSYCHOLOGY.theme.primaryColor,
    );
    expect(isolated.terminology.customer.singular).toBe('Paciente');
  });

  it('aceita apenas valores seguros para branding', () => {
    expect(UpdateTenantBrandingRequestSchema.safeParse({ primaryColor: 'blue' }).success).toBe(
      false,
    );
    expect(
      UpdateTenantBrandingRequestSchema.safeParse({ logoUrl: 'http://unsafe.invalid/logo.png' })
        .success,
    ).toBe(false);
    expect(
      UpdateTenantBrandingRequestSchema.safeParse({ fontFamily: 'url(javascript:alert(1))' })
        .success,
    ).toBe(false);
    expect(
      UpdateTenantBrandingRequestSchema.safeParse({
        primaryColor: '#123456',
        fontFamily: 'Inter',
        logoUrl: 'https://assets.example/logo.png',
      }).success,
    ).toBe(true);
  });

  it('trata override vazio como retorno ao termo do cat\u00e1logo', () => {
    const input = UpdateTenantTerminologyRequestSchema.parse({ customerSingular: '' });
    const experience = resolveTenantExperience({
      businessProfile: 'GENERIC',
      branding: null,
      terminology: input,
    });
    expect(experience.terminology.customer.singular).toBe('Cliente');
  });
});
