import {
  BusinessProfileCatalog,
  type BusinessTerminology,
  TenantBrandingSchema,
  type TenantTerminologyOverrides,
} from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';

interface TenantExperienceRecord {
  businessProfile: keyof typeof BusinessProfileCatalog;
  branding: {
    useProfileDefaults: boolean;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;
    mutedTextColor: string;
    borderColor: string;
    borderRadius: string;
    fontFamily: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    bannerUrl: string | null;
    pwaIconUrl: string | null;
    splashUrl: string | null;
    onPrimaryColor?: string | null;
    headerColor?: string | null;
    headerTextColor?: string | null;
    navigationColor?: string | null;
    activeColor?: string | null;
  } | null;
  terminology: TenantTerminologyOverrides | null;
}

function resolveTerminology(
  defaults: BusinessTerminology,
  overrides: TenantTerminologyOverrides | null,
): BusinessTerminology {
  return {
    professional: {
      singular: overrides?.professionalSingular ?? defaults.professional.singular,
      plural: overrides?.professionalPlural ?? defaults.professional.plural,
    },
    customer: {
      singular: overrides?.customerSingular ?? defaults.customer.singular,
      plural: overrides?.customerPlural ?? defaults.customer.plural,
    },
    service: {
      singular: overrides?.serviceSingular ?? defaults.service.singular,
      plural: overrides?.servicePlural ?? defaults.service.plural,
    },
    appointment: {
      singular: overrides?.appointmentSingular ?? defaults.appointment.singular,
      plural: overrides?.appointmentPlural ?? defaults.appointment.plural,
    },
    unit: {
      singular: overrides?.unitSingular ?? defaults.unit.singular,
      plural: overrides?.unitPlural ?? defaults.unit.plural,
    },
  };
}

export function resolveTenantExperience(tenant: TenantExperienceRecord) {
  const profile = BusinessProfileCatalog[tenant.businessProfile];
  const defaults = profile.theme;
  const branding = TenantBrandingSchema.parse({
    useProfileDefaults: tenant.branding?.useProfileDefaults ?? true,
    primaryColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.primaryColor
        : defaults.primaryColor,
    secondaryColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.secondaryColor
        : defaults.secondaryColor,
    accentColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.accentColor
        : defaults.accentColor,
    backgroundColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.backgroundColor
        : defaults.backgroundColor,
    surfaceColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.surfaceColor
        : defaults.surfaceColor,
    textColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.textColor
        : defaults.textColor,
    mutedTextColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.mutedTextColor
        : defaults.mutedTextColor,
    borderColor:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.borderColor
        : defaults.borderColor,
    borderRadius:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.borderRadius
        : defaults.borderRadius,
    fontFamily:
      tenant.branding?.useProfileDefaults === false
        ? tenant.branding.fontFamily
        : defaults.fontFamily,
    // Tokens semânticos: `null` mantém o comportamento derivado atual.
    onPrimaryColor: tenant.branding?.onPrimaryColor ?? null,
    headerColor: tenant.branding?.headerColor ?? null,
    headerTextColor: tenant.branding?.headerTextColor ?? null,
    navigationColor: tenant.branding?.navigationColor ?? null,
    activeColor: tenant.branding?.activeColor ?? null,
    logoUrl: tenant.branding?.logoUrl ?? null,
    faviconUrl: tenant.branding?.faviconUrl ?? null,
    bannerUrl: tenant.branding?.bannerUrl ?? null,
    pwaIconUrl: tenant.branding?.pwaIconUrl ?? null,
    splashUrl: tenant.branding?.splashUrl ?? null,
  });

  return {
    profile: profile.code,
    branding,
    terminology: resolveTerminology(profile.terminology, tenant.terminology),
  };
}

export class TenantExperienceResolver {
  public constructor(private readonly client: PrismaClient) {}

  public async findByTenantPublicId(tenantPublicId: string) {
    const tenant = await this.client.tenant.findUnique({
      where: { publicId: tenantPublicId },
      include: { branding: true, terminology: true },
    });
    return tenant === null ? null : resolveTenantExperience(tenant);
  }
}
