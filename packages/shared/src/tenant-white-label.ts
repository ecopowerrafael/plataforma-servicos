import { z } from 'zod';

import {
  BusinessProfileCodeSchema,
  BusinessTerminologySchema,
  TenantBrandingSchema,
} from './business-profile.js';
import { TenantPublicIdSchema, TenantSlugOutputSchema, TenantSlugSchema } from './tenant.js';

export const TenantMediaKindSchema = z.enum([
  'LOGO',
  'LOGO_COMPACT',
  'FAVICON',
  'APP_ICON',
  'SPLASH',
  'BANNER_DESKTOP',
  'BANNER_MOBILE',
  'INSTITUTIONAL',
]);
export const TenantPublicThemeSchema = z.enum(['CLASSIC', 'MODERN', 'PREMIUM', 'LUXURY']);
/** Modelo (estrutura/UX) do app público — independente do tema visual. */
export const TenantPublicLayoutSchema = z.enum(['CLASSIC', 'PREMIUM_APP']);

export const TenantMediaAssetSchema = z.object({
  publicId: z.uuid(),
  kind: TenantMediaKindSchema,
  originalName: z.string(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive(),
  altText: z.string().nullable(),
  url: z.string().startsWith('/'),
  createdAt: z.iso.datetime({ offset: true }),
});
export const TenantMediaListResponseSchema = z.object({ assets: z.array(TenantMediaAssetSchema) });
export const UpdateTenantMediaMetadataRequestSchema = z
  .object({ altText: z.string().trim().min(1).max(180).nullable() })
  .strict();

const NullableText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional();
export const UpdateTenantPublicSiteRequestSchema = z
  .object({
    theme: TenantPublicThemeSchema.optional(),
    layout: TenantPublicLayoutSchema.optional(),
    heroTitle: NullableText(160),
    heroSubtitle: NullableText(500),
    aboutText: NullableText(4000),
    primaryCallToAction: NullableText(100),
    footerText: NullableText(500),
    seoTitle: NullableText(70),
    seoDescription: NullableText(160),
    pwaName: NullableText(80),
    pwaShortName: NullableText(30),
    pwaDescription: NullableText(160),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma altera\u00e7\u00e3o.');

export const TenantPublicSiteSchema = UpdateTenantPublicSiteRequestSchema.safeExtend({
  theme: TenantPublicThemeSchema,
  layout: TenantPublicLayoutSchema,
  heroTitle: z.string().nullable(),
  heroSubtitle: z.string().nullable(),
  aboutText: z.string().nullable(),
  primaryCallToAction: z.string().nullable(),
  footerText: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  pwaName: z.string().nullable(),
  pwaShortName: z.string().nullable(),
  pwaDescription: z.string().nullable(),
});
export const TenantWhiteLabelResponseSchema = z.object({
  slug: TenantSlugOutputSchema,
  displayName: z.string().min(2),
  businessProfile: BusinessProfileCodeSchema,
  branding: TenantBrandingSchema,
  site: TenantPublicSiteSchema,
  assets: z.array(TenantMediaAssetSchema),
});

export const PublicTenantSiteResponseSchema = z.object({
  slug: TenantSlugOutputSchema,
  displayName: z.string(),
  businessProfile: BusinessProfileCodeSchema,
  branding: TenantBrandingSchema,
  terminology: BusinessTerminologySchema,
  site: TenantPublicSiteSchema,
  assets: z.array(TenantMediaAssetSchema),
  services: z.array(
    z.object({
      publicId: z.uuid(),
      name: z.string(),
      description: z.string().nullable(),
      imageUrl: z.string().nullable(),
      iconKey: z.string().nullable(),
      priceCents: z.string(),
      durationMinutes: z.number().int(),
    }),
  ),
  professionals: z.array(
    z.object({
      publicId: z.uuid(),
      name: z.string(),
      bio: z.string().nullable(),
      photoUrl: z.string().nullable(),
    }),
  ),
  unit: z
    .object({
      name: z.string(),
      street: z.string().nullable(),
      number: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      countryCode: z.string().nullable(),
      timezone: z.string(),
    })
    .nullable(),
  units: z.array(
    z.object({
      publicId: z.uuid(),
      name: z.string(),
      isHeadquarters: z.boolean(),
      street: z.string().nullable(),
      number: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      countryCode: z.string().nullable(),
      timezone: z.string(),
    }),
  ),
  bookingAvailable: z.boolean().optional(),
  unavailableMessage: z.string().nullable().optional(),
  /** Instalação só é oferecida quando o tenant publicou o aplicativo. */
  pwaPublished: z.boolean().default(false),
});
/**
 * Manifest do aplicativo do tenant. O `id` é derivado do `publicId` imutável
 * do tenant: mudar slug, nome, tema ou ícone NÃO cria outro aplicativo para o
 * navegador.
 */
export const PublicTenantManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  short_name: z.string(),
  description: z.string().nullable(),
  theme_color: z.string(),
  background_color: z.string(),
  icons: z.array(
    z.object({
      src: z.string(),
      sizes: z.string(),
      type: z.string(),
      purpose: z.string().optional(),
    }),
  ),
  display: z.literal('standalone'),
  scope: z.string(),
  start_url: z.string(),
});

export const TenantPwaStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);

/** Requisitos verificados no backend antes de publicar o aplicativo. */
export const TenantPwaChecklistSchema = z.object({
  appName: z.boolean(),
  publicPage: z.boolean(),
  icon: z.boolean(),
  iconSquare: z.boolean(),
  iconMinimumSize: z.boolean(),
  iconDerivatives: z.boolean(),
  branding: z.boolean(),
});

export const TenantPwaResponseSchema = z.object({
  status: TenantPwaStatusSchema,
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  checklist: TenantPwaChecklistSchema,
  ready: z.boolean(),
  appName: z.string(),
  slug: z.string(),
  publicUrl: z.string(),
  /** Instrução exibida quando o ícone impede a publicação. */
  iconMessage: z.string().nullable(),
});

export type PublicTenantManifest = z.infer<typeof PublicTenantManifestSchema>;
export type TenantPwaStatus = z.infer<typeof TenantPwaStatusSchema>;
export type TenantPwaResponse = z.infer<typeof TenantPwaResponseSchema>;
export const PublicTenantSlugParamsSchema = z.object({ slug: TenantSlugSchema }).strict();
export const TenantPublicIdParamsSchema = z
  .object({ tenantPublicId: TenantPublicIdSchema })
  .strict();
export const TenantMediaParamsSchema = TenantPublicIdParamsSchema.extend({
  assetPublicId: z.uuid(),
}).strict();

export type UpdateTenantPublicSiteRequest = z.infer<typeof UpdateTenantPublicSiteRequestSchema>;
