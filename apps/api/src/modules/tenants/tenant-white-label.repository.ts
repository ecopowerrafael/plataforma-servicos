import {
  type Prisma,
  type PrismaClient,
  type TenantMediaKind,
} from '../../database-client/client.js';

export class TenantWhiteLabelRepository {
  public constructor(private readonly client: PrismaClient) {}

  public findTenant(tenantId: bigint) {
    return this.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        publicId: true,
        slug: true,
        displayName: true,
        businessProfile: true,
        status: true,
        onboardingCompletedAt: true,
        branding: {
          select: {
            useProfileDefaults: true,
            primaryColor: true,
            secondaryColor: true,
            accentColor: true,
            backgroundColor: true,
            surfaceColor: true,
            textColor: true,
            mutedTextColor: true,
            borderColor: true,
            borderRadius: true,
            fontFamily: true,
            onPrimaryColor: true,
            headerColor: true,
            headerTextColor: true,
            navigationColor: true,
            activeColor: true,
            logoUrl: true,
            faviconUrl: true,
            bannerUrl: true,
            pwaIconUrl: true,
            splashUrl: true,
          },
        },
        terminology: {
          select: {
            professionalSingular: true,
            professionalPlural: true,
            customerSingular: true,
            customerPlural: true,
            serviceSingular: true,
            servicePlural: true,
            appointmentSingular: true,
            appointmentPlural: true,
            unitSingular: true,
            unitPlural: true,
          },
        },
        publicSite: {
          select: {
            theme: true,
            layout: true,
            heroTitle: true,
            heroSubtitle: true,
            aboutText: true,
            primaryCallToAction: true,
            footerText: true,
            seoTitle: true,
            seoDescription: true,
            pwaName: true,
            pwaShortName: true,
            pwaDescription: true,
          },
        },
      },
    });
  }

  /**
   * Estado de publicação do PWA, lido isoladamente e à prova de banco ainda
   * não migrado: se as colunas não existirem, o tenant é tratado como
   * rascunho em vez de derrubar a página pública e o Brand Studio.
   */
  public async findPwaState(
    tenantId: bigint,
  ): Promise<{ status: 'DRAFT' | 'PUBLISHED'; publishedAt: Date | null }> {
    try {
      const site = await this.client.tenantPublicSite.findUnique({
        where: { tenantId },
        select: { pwaStatus: true, pwaPublishedAt: true },
      });
      return {
        status: site?.pwaStatus ?? 'DRAFT',
        publishedAt: site?.pwaPublishedAt ?? null,
      };
    } catch {
      return { status: 'DRAFT', publishedAt: null };
    }
  }

  /** Publicação do aplicativo; cria a linha do site público se ainda não existir. */
  public async upsertPwaStatus(
    tenantId: bigint,
    status: 'DRAFT' | 'PUBLISHED',
    publishedAt: Date | null,
  ): Promise<void> {
    await this.client.tenantPublicSite.upsert({
      where: { tenantId },
      create: { tenantId, pwaStatus: status, pwaPublishedAt: publishedAt },
      update: { pwaStatus: status, pwaPublishedAt: publishedAt },
    });
  }

  public findTenantByPublicId(publicId: string) {
    return this.client.tenant.findUnique({
      where: { publicId },
      select: {
        id: true,
        publicId: true,
        slug: true,
        displayName: true,
        businessProfile: true,
        onboardingCompletedAt: true,
        branding: {
          select: {
            useProfileDefaults: true,
            primaryColor: true,
            secondaryColor: true,
            accentColor: true,
            backgroundColor: true,
            surfaceColor: true,
            textColor: true,
            mutedTextColor: true,
            borderColor: true,
            borderRadius: true,
            fontFamily: true,
            onPrimaryColor: true,
            headerColor: true,
            headerTextColor: true,
            navigationColor: true,
            activeColor: true,
            logoUrl: true,
            faviconUrl: true,
            bannerUrl: true,
            pwaIconUrl: true,
            splashUrl: true,
          },
        },
        terminology: {
          select: {
            professionalSingular: true,
            professionalPlural: true,
            customerSingular: true,
            customerPlural: true,
            serviceSingular: true,
            servicePlural: true,
            appointmentSingular: true,
            appointmentPlural: true,
            unitSingular: true,
            unitPlural: true,
          },
        },
        publicSite: {
          select: {
            theme: true,
            layout: true,
            heroTitle: true,
            heroSubtitle: true,
            aboutText: true,
            primaryCallToAction: true,
            footerText: true,
            seoTitle: true,
            seoDescription: true,
            pwaName: true,
            pwaShortName: true,
            pwaDescription: true,
          },
        },
      },
    });
  }

  public findActiveTenantBySlug(slug: string) {
    return this.client.tenant.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: { id: true, publicId: true },
    });
  }

  public findPublicTenant(slug: string) {
    return this.client.tenant.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: {
        id: true,
        publicId: true,
        slug: true,
        displayName: true,
        businessProfile: true,
        branding: true,
        terminology: true,
        publicSite: {
          select: {
            theme: true,
            layout: true,
            heroTitle: true,
            heroSubtitle: true,
            aboutText: true,
            primaryCallToAction: true,
            footerText: true,
            seoTitle: true,
            seoDescription: true,
            pwaName: true,
            pwaShortName: true,
            pwaDescription: true,
          },
        },
        mediaAssets: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        services: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        professionals: {
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        businessUnits: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isHeadquarters: 'desc' }, { name: 'asc' }],
        },
      },
    });
  }

  public listAssets(tenantId: bigint) {
    return this.client.tenantMediaAsset.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  public findAsset(tenantId: bigint, publicId: string) {
    return this.client.tenantMediaAsset.findFirst({
      where: { tenantId, publicId, deletedAt: null },
    });
  }

  public findAssetByPublicId(publicId: string) {
    return this.client.tenantMediaAsset.findFirst({
      where: { publicId, deletedAt: null, tenant: { status: 'ACTIVE' } },
    });
  }

  public findPublicServiceImage(publicId: string) {
    return this.client.service.findFirst({
      where: { publicId, active: true, tenant: { status: 'ACTIVE' } },
      select: { imagePath: true },
    });
  }

  public findPublicProfessionalImage(publicId: string) {
    return this.client.professional.findFirst({
      where: { publicId, active: true, tenant: { status: 'ACTIVE' } },
      select: { photoPath: true },
    });
  }

  public async replaceKind(
    tenantId: bigint,
    kind: TenantMediaKind,
    data: Prisma.TenantMediaAssetUncheckedCreateInput,
  ) {
    return this.client.$transaction(async (tx) => {
      if (kind !== 'INSTITUTIONAL')
        await tx.tenantMediaAsset.updateMany({
          where: { tenantId, kind, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      return tx.tenantMediaAsset.create({ data });
    });
  }

  public updateAsset(id: bigint, data: Prisma.TenantMediaAssetUncheckedUpdateInput) {
    return this.client.tenantMediaAsset.update({ where: { id }, data });
  }

  public deleteAsset(id: bigint) {
    return this.client.tenantMediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  public upsertBranding(tenantId: bigint, data: Prisma.TenantBrandingUncheckedCreateInput) {
    return this.client.tenantBranding.upsert({
      where: { tenantId },
      create: data,
      update: data,
    });
  }

  public upsertSite(tenantId: bigint, data: Prisma.TenantPublicSiteUncheckedCreateInput) {
    return this.client.tenantPublicSite.upsert({
      where: { tenantId },
      create: data,
      update: data,
      select: {
        theme: true,
        layout: true,
        heroTitle: true,
        heroSubtitle: true,
        aboutText: true,
        primaryCallToAction: true,
        footerText: true,
        seoTitle: true,
        seoDescription: true,
        pwaName: true,
        pwaShortName: true,
        pwaDescription: true,
      },
    });
  }

  public async recordAudit(data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
    await this.client.auditLog.create({ data });
  }
}
