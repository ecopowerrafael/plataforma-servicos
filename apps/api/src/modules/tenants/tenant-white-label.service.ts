import { randomUUID } from 'node:crypto';

import {
  BusinessProfileCatalog,
  PublicTenantManifestSchema,
  PublicTenantSiteResponseSchema,
  TenantMediaAssetSchema,
  TenantMediaListResponseSchema,
  TenantPublicSiteSchema,
  TenantPwaResponseSchema,
  TenantWhiteLabelResponseSchema,
  type TenantBranding,
  type UpdateTenantPublicSiteRequest,
} from '@plataforma/shared';

import { PlanEntitlementService } from './plan-entitlement.service.js';
import { resolveTenantExperience } from './tenant-experience.resolver.js';
import {
  APP_ICON_MIN_SIZE,
  inspectAppIcon,
  type AppIconSize,
  type TenantMediaStorage,
} from './tenant-media.storage.js';
import { type TenantWhiteLabelRepository } from './tenant-white-label.repository.js';
import { type PrismaClient, type TenantMediaKind } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type TenantCommercialPolicyService } from '../platform/tenant-commercial-policy.service.js';
import { TenantCommercialStatusResolver } from '../platform/tenant-commercial-status.resolver.js';
import { type ServiceImageStorage } from '../services/service-image.storage.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}

function notFound(): AppError {
  return new AppError({
    code: 'TENANT_WHITE_LABEL_NOT_FOUND',
    message: 'Configura\u00e7\u00e3o do estabelecimento n\u00e3o encontrada.',
    statusCode: 404,
  });
}

function publicImageNotFound(): AppError {
  return new AppError({
    code: 'TENANT_PUBLIC_IMAGE_NOT_FOUND',
    message: 'Imagem n\u00e3o encontrada.',
    statusCode: 404,
  });
}

function assetPublic(asset: {
  publicId: string;
  kind: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  altText: string | null;
  createdAt: Date;
}) {
  return TenantMediaAssetSchema.parse({
    publicId: asset.publicId,
    kind: asset.kind,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    altText: asset.altText,
    url: `/public/media/${asset.publicId}`,
    createdAt: asset.createdAt.toISOString(),
  });
}

function sitePublic(
  site: {
    theme: string;
    layout?: string;
    heroTitle: string | null;
    heroSubtitle: string | null;
    aboutText: string | null;
    primaryCallToAction: string | null;
    footerText: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    pwaName: string | null;
    pwaShortName: string | null;
    pwaDescription: string | null;
  } | null,
) {
  return TenantPublicSiteSchema.parse(
    site ?? {
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
    },
  );
}

export class TenantWhiteLabelService {
  private readonly commercialStatusResolver = new TenantCommercialStatusResolver();

  public constructor(
    private readonly repository: TenantWhiteLabelRepository,
    private readonly storage: TenantMediaStorage,
    private readonly serviceImages: ServiceImageStorage,
    private readonly professionalImages: ServiceImageStorage,
    private readonly commercialPolicyService?: TenantCommercialPolicyService,
    private readonly commercialClient?: PrismaClient,
  ) {}

  private async resolveBookingAvailability(
    tenantId: bigint,
  ): Promise<{ bookingAvailable: boolean; unavailableMessage: string | null }> {
    if (this.commercialPolicyService === undefined || this.commercialClient === undefined) {
      return { bookingAvailable: true, unavailableMessage: null };
    }
    const subscription =
      (await this.commercialClient.tenantSubscription.findFirst({
        where: { tenantId, effectiveKey: 'EFFECTIVE' },
      })) ??
      (await this.commercialClient.tenantSubscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      }));
    if (subscription === null) return { bookingAvailable: true, unavailableMessage: null };
    const policy = await this.commercialPolicyService.getOrCreateRaw();
    const status = this.commercialStatusResolver.resolve(subscription, policy);
    return {
      bookingAvailable: status.capabilities.canAcceptPublicBooking,
      unavailableMessage: status.capabilities.canAcceptPublicBooking
        ? null
        : (status.publicMessage ?? 'Agendamento online indisponível no momento.'),
    };
  }

  public async get(tenantId: bigint) {
    const tenant = await this.repository.findTenant(tenantId);
    if (tenant === null) throw notFound();
    return TenantWhiteLabelResponseSchema.parse({
      slug: tenant.slug,
      displayName: tenant.displayName,
      businessProfile: tenant.businessProfile,
      branding: resolveTenantExperience(tenant).branding,
      site: sitePublic(tenant.publicSite),
      assets: (await this.repository.listAssets(tenantId)).map(assetPublic),
    });
  }

  public async updateBranding(
    tenantId: bigint,
    input: { [Key in keyof TenantBranding]?: TenantBranding[Key] | undefined },
    actor: Actor,
  ) {
    const tenant = await this.repository.findTenant(tenantId);
    if (tenant === null) throw notFound();
    if (this.commercialClient !== undefined && tenant.onboardingCompletedAt !== null)
      await new PlanEntitlementService().assertFeatureEnabledForTenant(
        this.commercialClient,
        tenantId,
        'branding.customization.enabled',
      );

    const defaults = BusinessProfileCatalog[tenant.businessProfile].theme;
    const themeFields = [
      'primaryColor',
      'secondaryColor',
      'accentColor',
      'backgroundColor',
      'surfaceColor',
      'textColor',
      'mutedTextColor',
      'borderColor',
      'borderRadius',
      'fontFamily',
    ] as const;
    const hasThemeChange = themeFields.some((field) => input[field] !== undefined);
    const createData = {
      tenantId: tenant.id,
      useProfileDefaults:
        input.useProfileDefaults ??
        (hasThemeChange ? false : (tenant.branding?.useProfileDefaults ?? true)),
      primaryColor: input.primaryColor ?? tenant.branding?.primaryColor ?? defaults.primaryColor,
      secondaryColor:
        input.secondaryColor ?? tenant.branding?.secondaryColor ?? defaults.secondaryColor,
      accentColor: input.accentColor ?? tenant.branding?.accentColor ?? defaults.accentColor,
      backgroundColor:
        input.backgroundColor ?? tenant.branding?.backgroundColor ?? defaults.backgroundColor,
      surfaceColor: input.surfaceColor ?? tenant.branding?.surfaceColor ?? defaults.surfaceColor,
      textColor: input.textColor ?? tenant.branding?.textColor ?? defaults.textColor,
      mutedTextColor:
        input.mutedTextColor ?? tenant.branding?.mutedTextColor ?? defaults.mutedTextColor,
      borderColor: input.borderColor ?? tenant.branding?.borderColor ?? defaults.borderColor,
      borderRadius: input.borderRadius ?? tenant.branding?.borderRadius ?? defaults.borderRadius,
      fontFamily: input.fontFamily ?? tenant.branding?.fontFamily ?? defaults.fontFamily,
      // Tokens semânticos opcionais: `null` explícito volta ao derivado.
      onPrimaryColor:
        input.onPrimaryColor === undefined
          ? (tenant.branding?.onPrimaryColor ?? null)
          : input.onPrimaryColor,
      headerColor:
        input.headerColor === undefined
          ? (tenant.branding?.headerColor ?? null)
          : input.headerColor,
      headerTextColor:
        input.headerTextColor === undefined
          ? (tenant.branding?.headerTextColor ?? null)
          : input.headerTextColor,
      navigationColor:
        input.navigationColor === undefined
          ? (tenant.branding?.navigationColor ?? null)
          : input.navigationColor,
      activeColor:
        input.activeColor === undefined
          ? (tenant.branding?.activeColor ?? null)
          : input.activeColor,
      logoUrl: input.logoUrl === undefined ? (tenant.branding?.logoUrl ?? null) : input.logoUrl,
      faviconUrl:
        input.faviconUrl === undefined ? (tenant.branding?.faviconUrl ?? null) : input.faviconUrl,
      bannerUrl:
        input.bannerUrl === undefined ? (tenant.branding?.bannerUrl ?? null) : input.bannerUrl,
      pwaIconUrl:
        input.pwaIconUrl === undefined ? (tenant.branding?.pwaIconUrl ?? null) : input.pwaIconUrl,
      splashUrl:
        input.splashUrl === undefined ? (tenant.branding?.splashUrl ?? null) : input.splashUrl,
    };
    await this.repository.upsertBranding(tenant.id, createData);
    await this.audit(tenantId, tenant.publicId, 'tenant.branding.updated', actor);
    return this.get(tenantId);
  }

  public async listAssets(tenantId: bigint) {
    return TenantMediaListResponseSchema.parse({
      assets: (await this.repository.listAssets(tenantId)).map(assetPublic),
    });
  }

  public async upload(
    tenantId: bigint,
    kind: TenantMediaKind,
    originalName: string,
    image: Buffer,
    actor: Actor,
    altText?: string | null,
  ) {
    const tenant = await this.repository.findTenant(tenantId);
    if (tenant === null) throw notFound();
    if (this.commercialClient !== undefined && tenant.onboardingCompletedAt !== null)
      await new PlanEntitlementService().assertFeatureEnabledForTenant(
        this.commercialClient,
        tenantId,
        'branding.customization.enabled',
      );
    const publicId = randomUUID();
    const stored = await this.storage.save(tenant.publicId, publicId, image);
    try {
      const asset = await this.repository.replaceKind(tenantId, kind, {
        publicId,
        tenantId,
        kind,
        originalName: originalName.slice(0, 255),
        storageKey: stored.key,
        mimeType: stored.mimeType,
        byteSize: image.length,
        altText: altText ?? null,
      });
      await this.audit(
        tenantId,
        asset.publicId,
        `tenant.media.${kind.toLowerCase()}_uploaded`,
        actor,
      );
      return assetPublic(asset);
    } catch (error) {
      await this.storage.remove(stored.key);
      throw error;
    }
  }

  public async updateAsset(
    tenantId: bigint,
    publicId: string,
    altText: string | null,
    actor: Actor,
  ) {
    const asset = await this.repository.findAsset(tenantId, publicId);
    if (asset === null) throw notFound();
    const updated = await this.repository.updateAsset(asset.id, { altText });
    await this.audit(tenantId, publicId, 'tenant.media.updated', actor);
    return assetPublic(updated);
  }

  public async deleteAsset(tenantId: bigint, publicId: string, actor: Actor) {
    const asset = await this.repository.findAsset(tenantId, publicId);
    if (asset === null) throw notFound();
    await this.repository.deleteAsset(asset.id);
    // O original é preservado; só os derivados do ícone são descartados.
    if (asset.kind === 'APP_ICON') await this.storage.removeAppIconDerivatives(asset.storageKey);
    await this.audit(tenantId, publicId, 'tenant.media.removed', actor);
  }

  public async updateSite(tenantId: bigint, input: UpdateTenantPublicSiteRequest, actor: Actor) {
    const tenant = await this.repository.findTenant(tenantId);
    if (tenant === null) throw notFound();
    if (this.commercialClient !== undefined && tenant.onboardingCompletedAt !== null)
      await new PlanEntitlementService().assertFeatureEnabledForTenant(
        this.commercialClient,
        tenantId,
        'branding.customization.enabled',
      );
    const site = await this.repository.upsertSite(tenantId, {
      tenantId,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    });
    await this.audit(tenantId, tenant.publicId, 'tenant.public_site.updated', actor);
    return sitePublic(site);
  }

  public async getMedia(publicId: string) {
    const asset = await this.repository.findAssetByPublicId(publicId);
    if (asset === null) throw notFound();
    return this.storage.read(asset.storageKey);
  }

  public async publicServiceImage(
    publicId: string,
    variant: 'original' | 'thumbnail' = 'original',
  ) {
    const service = await this.repository.findPublicServiceImage(publicId);
    const imagePath = service?.imagePath;
    if (imagePath === undefined || imagePath === null) throw publicImageNotFound();
    return this.serviceImages.read(imagePath, variant);
  }

  public async publicProfessionalImage(
    publicId: string,
    variant: 'original' | 'thumbnail' = 'original',
  ) {
    const professional = await this.repository.findPublicProfessionalImage(publicId);
    const photoPath = professional?.photoPath;
    if (photoPath === undefined || photoPath === null) throw publicImageNotFound();
    return this.professionalImages.read(photoPath, variant);
  }

  public async publicSite(slug: string) {
    const tenant = await this.repository.findPublicTenant(slug);
    if (tenant === null) throw notFound();
    const experience = resolveTenantExperience(tenant);
    const { bookingAvailable, unavailableMessage } = await this.resolveBookingAvailability(
      tenant.id,
    );
    return PublicTenantSiteResponseSchema.parse({
      publicId: tenant.publicId,
      slug: tenant.slug,
      displayName: tenant.displayName,
      businessProfile: tenant.businessProfile,
      branding: experience.branding,
      terminology: experience.terminology,
      site: sitePublic(tenant.publicSite),
      assets: tenant.mediaAssets.map(assetPublic),
      services: tenant.services.map((service) => ({
        publicId: service.publicId,
        name: service.name,
        description: service.description,
        imageUrl:
          service.imagePath === null
            ? null
            : `/public/services/${service.publicId}/image?variant=thumbnail`,
        iconKey: service.iconKey,
        priceCents: service.priceCents.toString(),
        pricingMode: service.pricingMode,
        quoteNotice: service.quoteNotice,
        durationMinutes: service.durationMinutes,
      })),
      professionals: tenant.professionals.map((professional) => ({
        publicId: professional.publicId,
        name: professional.publicName,
        bio: professional.bio,
        photoUrl:
          professional.photoPath === null
            ? null
            : `/public/professionals/${professional.publicId}/image?variant=thumbnail`,
      })),
      unit:
        tenant.businessUnits[0] === undefined
          ? null
          : {
              name: tenant.businessUnits[0].name,
              street: tenant.businessUnits[0].street,
              number: tenant.businessUnits[0].number,
              complement: tenant.businessUnits[0].complement,
              district: tenant.businessUnits[0].district,
              city: tenant.businessUnits[0].city,
              state: tenant.businessUnits[0].state,
              postalCode: tenant.businessUnits[0].postalCode,
              countryCode: tenant.businessUnits[0].countryCode,
              latitude: tenant.businessUnits[0].latitude,
              longitude: tenant.businessUnits[0].longitude,
              googleMapsUrl: tenant.businessUnits[0].googleMapsUrl,
              timezone: tenant.businessUnits[0].timezone,
            },
      units: tenant.businessUnits.map((unit) => ({
        publicId: unit.publicId,
        name: unit.name,
        isHeadquarters: unit.isHeadquarters,
        street: unit.street,
        number: unit.number,
        complement: unit.complement,
        district: unit.district,
        city: unit.city,
        state: unit.state,
        postalCode: unit.postalCode,
        countryCode: unit.countryCode,
        latitude: unit.latitude,
        longitude: unit.longitude,
        googleMapsUrl: unit.googleMapsUrl,
        timezone: unit.timezone,
      })),
      bookingAvailable,
      unavailableMessage,
      pwaPublished: (await this.repository.findPwaState(tenant.id)).status === 'PUBLISHED',
    });
  }

  /**
   * Manifest do aplicativo do tenant. Servido na MESMA origem da página
   * pública (deploy single-origin), então `id`, `scope` e `start_url` podem ser
   * caminhos absolutos. O `id` vem do publicId imutável: trocar slug, nome,
   * tema ou ícone não cria outro aplicativo para o navegador.
   */
  public async manifest(slug: string) {
    const tenant = await this.repository.findPublicTenant(slug);
    if (tenant === null) throw notFound();
    const site = await this.publicSite(slug);
    const appIconValid = (await this.appIconState(tenant.id)).valid;
    return PublicTenantManifestSchema.parse({
      id: `/pwa/tenant/${tenant.publicId}`,
      name: site.site.pwaName ?? site.displayName,
      short_name: site.site.pwaShortName ?? site.displayName.slice(0, 30),
      description: site.site.pwaDescription ?? site.site.seoDescription,
      theme_color: site.branding.primaryColor,
      background_color: site.branding.backgroundColor,
      // Cada tamanho aponta para um arquivo PNG realmente daquele tamanho,
      // derivado do APP_ICON. Sem APP_ICON válido, o array fica vazio (e o
      // tenant não consegue publicar).
      icons: appIconValid
        ? [
            {
              src: `/public/sites/${site.slug}/app-icon-192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `/public/sites/${site.slug}/app-icon-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ]
        : [],
      display: 'standalone',
      scope: `/public/${site.slug}`,
      start_url: `/public/${site.slug}`,
    });
  }

  /** Manifest público do app de trabalho; só expõe identidade já pública do tenant/profissional. */
  public async professionalManifest(tenantPublicId: string, professionalPublicId: string) {
    const tenant = await this.repository.findTenantByPublicId(tenantPublicId);
    if (tenant === null || this.commercialClient === undefined) throw notFound();
    const professional = await this.commercialClient.professional.findFirst({
      where: { tenantId: tenant.id, publicId: professionalPublicId, active: true },
      select: { publicId: true },
    });
    if (professional === null) throw notFound();
    const base = await this.manifest(tenant.slug);
    return PublicTenantManifestSchema.parse({
      ...base,
      // O APP_ICON do tenant é preferido; sem ele o Professional App mantém os
      // ícones globais já publicados, sem exigir novo upload ou outro storage.
      icons:
        base.icons.length > 0
          ? base.icons
          : [
              {
                src: '/icons/agendei-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable',
              },
              {
                src: '/icons/agendei-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
              },
            ],
      id: `/pwa/professional/${tenant.publicId}/${professional.publicId}`,
      name: `${tenant.displayName} — Profissional`,
      short_name: `${tenant.displayName} Profissional`.slice(0, 30),
      scope: `/public/${tenant.slug}/profissional`,
      start_url: `/public/${tenant.slug}/profissional`,
    });
  }

  /**
   * Estado do APP_ICON: o asset é a fonte única dos ícones quadrados do
   * aplicativo (o logo pode ser horizontal e nunca é usado aqui). O arquivo
   * original é preservado como enviado.
   */
  private async appIconState(
    tenantId: bigint,
  ): Promise<{ exists: boolean; square: boolean; largeEnough: boolean; valid: boolean }> {
    const assets = await this.repository.listAssets(tenantId);
    const icon = assets.find((asset) => asset.kind === 'APP_ICON');
    if (icon === undefined)
      return { exists: false, square: false, largeEnough: false, valid: false };
    try {
      const { buffer } = await this.storage.read(icon.storageKey);
      const inspection = inspectAppIcon(buffer);
      return { exists: true, ...inspection };
    } catch {
      return { exists: true, square: false, largeEnough: false, valid: false };
    }
  }

  /** PNG do tamanho pedido, derivado sob demanda do APP_ICON do tenant. */
  public async appIcon(slug: string, size: AppIconSize) {
    const tenant = await this.repository.findPublicTenant(slug);
    if (tenant === null) throw notFound();
    const icon = tenant.mediaAssets.find((asset) => asset.kind === 'APP_ICON');
    if (icon === undefined) throw publicImageNotFound();
    const { buffer } = await this.storage.read(icon.storageKey);
    if (!inspectAppIcon(buffer).valid) throw publicImageNotFound();
    return {
      buffer: await this.storage.appIconDerivative(icon.storageKey, size, buffer),
      mimeType: 'image/png' as const,
    };
  }

  /** Situação do aplicativo do tenant e o que ainda falta para publicar. */
  public async pwa(tenantId: bigint) {
    const tenant = await this.repository.findTenant(tenantId);
    if (tenant === null) throw notFound();
    const appName = tenant.publicSite?.pwaName ?? tenant.displayName;
    const [appIcon, pwaState] = await Promise.all([
      this.appIconState(tenantId),
      this.repository.findPwaState(tenantId),
    ]);
    const checklist = {
      appName: appName.trim().length >= 2,
      publicPage: tenant.slug.trim().length > 0 && tenant.status === 'ACTIVE',
      icon: appIcon.exists,
      iconSquare: appIcon.exists && appIcon.square,
      iconMinimumSize: appIcon.exists && appIcon.largeEnough,
      // Os derivados são gerados a partir do original válido, sob demanda.
      iconDerivatives: appIcon.valid,
      branding: tenant.branding !== null,
    };
    return TenantPwaResponseSchema.parse({
      status: pwaState.status,
      publishedAt: pwaState.publishedAt?.toISOString() ?? null,
      checklist,
      ready: Object.values(checklist).every(Boolean),
      appName,
      slug: tenant.slug,
      publicUrl: `/public/${tenant.slug}`,
      iconMessage: appIcon.valid
        ? null
        : `Para publicar o aplicativo, envie um ícone quadrado de pelo menos ${String(APP_ICON_MIN_SIZE)}×${String(APP_ICON_MIN_SIZE)} px.`,
    });
  }

  /** Publica o aplicativo depois de revalidar o checklist no servidor. */
  public async publishPwa(tenantId: bigint, actor: Actor) {
    const current = await this.pwa(tenantId);
    if (!current.ready)
      throw new AppError({
        code: 'TENANT_PWA_NOT_READY',
        message: 'Conclua os itens pendentes antes de publicar o aplicativo.',
        statusCode: 422,
      });
    if (current.status !== 'PUBLISHED') {
      await this.repository.upsertPwaStatus(tenantId, 'PUBLISHED', new Date());
      await this.audit(tenantId, current.slug, 'tenant_pwa.published', actor);
    }
    return this.pwa(tenantId);
  }

  private async audit(tenantId: bigint, targetPublicId: string, action: string, actor: Actor) {
    await this.repository.recordAudit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'tenant_white_label',
      targetPublicId,
    });
  }
}
