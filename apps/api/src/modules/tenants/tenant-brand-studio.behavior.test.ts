import { describe, expect, it, vi } from 'vitest';

import { updateTenantIdentity, updateTenantOnboarding } from './tenant-identity.service.js';
import { validateTenantMediaUpload } from './tenant-media.storage.js';
import { type TenantMediaStorage } from './tenant-media.storage.js';
import { TenantWhiteLabelService } from './tenant-white-label.service.js';
import {
  type Prisma,
  type PrismaClient,
  type TenantMediaKind,
} from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type ServiceImageStorage } from '../services/service-image.storage.js';

const tenantId = 41n;
const currentIdentity = {
  legalName: 'Empresa Teste Ltda',
  displayName: 'Empresa Teste',
  slug: 'empresa-teste',
  slugChangedAt: null,
  businessProfile: 'GENERIC' as const,
  businessTypeCustom: null,
};

function png(width: number, height: number): Buffer {
  const image = Buffer.alloc(24);
  Buffer.from('\x89PNG\r\n\x1a\n', 'binary').copy(image, 0);
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image;
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x04, 0x45, 0x78,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function errorCode(action: () => void): string {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error('A operação deveria ter falhado.');
}

describe('tenant Brand Studio behavior', () => {
  it('returns safe white-label defaults for a legacy tenant with no branding or banners', async () => {
    const repository = {
      findTenant: vi.fn().mockResolvedValue({
        id: tenantId,
        publicId: 'legacy-tenant-public-id',
        slug: 'empresa-legada',
        displayName: 'Empresa Legada',
        businessProfile: 'GENERIC',
        branding: null,
        terminology: null,
        publicSite: null,
      }),
      listAssets: vi.fn().mockResolvedValue([]),
    };
    const unusedStorage = {} as ServiceImageStorage & TenantMediaStorage;
    const service = new TenantWhiteLabelService(
      repository as never,
      unusedStorage,
      unusedStorage,
      unusedStorage,
    );

    const response = await service.get(tenantId);

    expect(response.slug).toBe('empresa-legada');
    expect(response.site.theme).toBe('CLASSIC');
    expect(response.assets).toEqual([]);
    expect(response.branding.primaryColor).toBeDefined();
  });

  it('locks a slug change atomically inside the current tenant', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const transaction = { tenant: { updateMany, update } };
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({ slug: 'empresa-teste', slugChangedAt: null })
      .mockResolvedValueOnce({ ...currentIdentity, slug: 'novo-endereco', slugChangedAt: new Date() });
    const client = {
      tenant: { findUniqueOrThrow },
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    const result = await updateTenantIdentity(client, tenantId, { slug: 'novo-endereco' });

    expect(updateMany).toHaveBeenCalledOnce();
    const updateManyInput = updateMany.mock.calls[0]?.[0] as unknown as {
      where: { id: bigint; slugChangedAt: null };
      data: { slug: string; slugChangedAt: Date };
    };
    expect(updateManyInput).toEqual({
      where: { id: tenantId, slugChangedAt: null },
      data: { slug: 'novo-endereco', slugChangedAt: updateManyInput.data.slugChangedAt },
    });
    expect(updateManyInput.data.slugChangedAt).toBeInstanceOf(Date);
    expect(update).toHaveBeenCalledWith({ where: { id: tenantId }, data: {} });
    expect(result.identity.slug).toBe('novo-endereco');
    expect(result.identity.slugChangeAvailable).toBe(false);
  });

  it('rejects a concurrent second slug change', async () => {
    const transaction = {
      tenant: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
      },
    };
    const client = {
      tenant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          slug: 'empresa-teste',
          slugChangedAt: null,
        }),
      },
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await expect(
      updateTenantIdentity(client, tenantId, { slug: 'novo-endereco' }),
    ).rejects.toMatchObject({ code: 'TENANT_SLUG_CHANGE_ALREADY_USED', statusCode: 409 });
    expect(transaction.tenant.update).not.toHaveBeenCalled();
  });

  it('validates real image type, size, dimensions and square PWA icons', () => {
    expect(() => {
      validateTenantMediaUpload(png(512, 512), 'icone.png', 'image/png', 'APP_ICON');
    }).not.toThrow();
    expect(
      errorCode(() => {
        validateTenantMediaUpload(png(512, 256), 'icone.png', 'image/png', 'APP_ICON');
      }),
    ).toBe('TENANT_MEDIA_ICON_MUST_BE_SQUARE');
    expect(
      errorCode(() => {
        validateTenantMediaUpload(png(512, 512), 'icone.jpg', 'image/jpeg', 'APP_ICON');
      }),
    ).toBe('SERVICE_IMAGE_MIME_MISMATCH');
  });

  it('accepts valid JPEG and PNG by magic bytes despite common browser MIME aliases', () => {
    expect(() => {
      validateTenantMediaUpload(jpeg(640, 480), 'foto.JPEG', 'image/jpg', 'LOGO');
    }).not.toThrow();
    expect(() => {
      validateTenantMediaUpload(png(640, 480), 'banner.PNG', 'image/x-png', 'BANNER_DESKTOP');
    }).not.toThrow();
    expect(() => {
      validateTenantMediaUpload(jpeg(640, 480), 'foto.jpeg', 'application/octet-stream', 'SPLASH');
    }).not.toThrow();
  });

  it('rejects a renamed file when its extension conflicts with its real signature', () => {
    expect(
      errorCode(() => {
        validateTenantMediaUpload(jpeg(640, 480), 'arquivo.png', 'image/png', 'LOGO');
      }),
    ).toBe('SERVICE_IMAGE_MIME_MISMATCH');
    expect(
      errorCode(() => {
        validateTenantMediaUpload(Buffer.from('not an image'), 'arquivo.png', 'image/png', 'LOGO');
      }),
    ).toBe('SERVICE_IMAGE_TYPE_INVALID');
  });

  it('persists profile-specific public content after business type and name are chosen', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const transaction = {
      tenant: {
        updateMany: vi.fn(),
        update: vi.fn().mockResolvedValue({
          onboardingStep: 'BUSINESS_ADDRESS',
          onboardingCompletedAt: null,
          onboardingChecklistHiddenAt: null,
        }),
      },
      tenantPublicSite: { upsert },
    };
    const client = {
      tenant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          slug: 'barbearia-silva',
          slugChangedAt: null,
          displayName: 'Novo estabelecimento',
          businessProfile: 'BARBERSHOP',
          publicSite: null,
        }),
      },
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await updateTenantOnboarding(client, tenantId, {
      step: 'BUSINESS_ADDRESS',
      displayName: 'Barbearia Silva',
    });

    const upsertInput = upsert.mock.calls[0]?.[0] as {
      where: { tenantId: bigint };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(upsertInput.where).toEqual({ tenantId });
    expect(upsertInput.create).toMatchObject({
      tenantId,
      heroTitle: 'Barbearia Silva',
      heroSubtitle: 'Seu estilo, no seu tempo.',
      aboutText: 'Agende seu horário de forma rápida e prática.',
      primaryCallToAction: 'Agendar horário',
    });
    expect(upsertInput.update).toBeDefined();
  });

  it('stores and replaces media only in the authenticated tenant scope', async () => {
    const repository = {
      findTenant: vi.fn().mockResolvedValue({ id: tenantId, publicId: 'tenant-public-id' }),
      replaceKind: vi
        .fn()
        .mockImplementation(
          (
            _tenantId: bigint,
            kind: TenantMediaKind,
            data: Prisma.TenantMediaAssetUncheckedCreateInput,
          ) => ({
            id: 99n,
            ...data,
            kind,
            createdAt: new Date('2026-08-10T12:00:00.000Z'),
          }),
        ),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };
    const storage = {
      save: vi.fn().mockResolvedValue({ key: 'tenant-public-id/asset/image.png', mimeType: 'image/png' }),
      remove: vi.fn(),
    };
    const unusedImages = {} as ServiceImageStorage;
    const service = new TenantWhiteLabelService(
      repository as never,
      storage as never,
      unusedImages,
      unusedImages,
    );

    const asset = await service.upload(
      tenantId,
      'LOGO',
      'logo.png',
      png(512, 512),
      { userId: 7n, sessionId: 8n },
    );

    expect(storage.save).toHaveBeenCalledWith('tenant-public-id', expect.any(String), expect.any(Buffer));
    expect(repository.replaceKind).toHaveBeenCalledWith(
      tenantId,
      'LOGO',
      expect.objectContaining({ tenantId, originalName: 'logo.png' }),
    );
    expect(asset.kind).toBe('LOGO');
  });

  it('persists color tokens and theme in the authenticated tenant', async () => {
    const tenant = {
      id: tenantId,
      publicId: '1c6d0ab9-b76a-4854-b736-30bf6eff2f88',
      slug: 'empresa-teste',
      displayName: 'Empresa Teste',
      businessProfile: 'GENERIC' as const,
      onboardingCompletedAt: null,
      branding: null,
      terminology: null,
      publicSite: null,
    };
    const upsertBranding = vi.fn().mockResolvedValue({});
    const upsertSite = vi.fn().mockResolvedValue({
      theme: 'PREMIUM',
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
    });
    const repository = {
      findTenant: vi.fn().mockResolvedValue(tenant),
      upsertBranding,
      upsertSite,
      listAssets: vi.fn().mockResolvedValue([]),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };
    const unusedStorage = {} as ServiceImageStorage & TenantMediaStorage;
    const service = new TenantWhiteLabelService(
      repository as never,
      unusedStorage,
      unusedStorage,
      unusedStorage,
      undefined,
      { tenantSubscription: { findFirst: vi.fn(() => Promise.reject(new Error('gate called'))) } } as never,
    );

    await service.updateBranding(
      tenantId,
      {
        primaryColor: '#2457D6',
        secondaryColor: '#1B419F',
        accentColor: '#4F78DE',
        backgroundColor: '#F6F8FD',
        surfaceColor: '#FFFFFF',
        textColor: '#0F172A',
        mutedTextColor: '#64748B',
        borderColor: '#D5DDF4',
      },
      { userId: 7n, sessionId: 8n },
    );
    const site = await service.updateSite(
      tenantId,
      { theme: 'PREMIUM' },
      { userId: 7n, sessionId: 8n },
    );

    expect(upsertBranding).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        tenantId,
        useProfileDefaults: false,
        primaryColor: '#2457D6',
        backgroundColor: '#F6F8FD',
      }),
    );
    expect(upsertSite).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ tenantId, theme: 'PREMIUM' }),
    );
    expect(site.theme).toBe('PREMIUM');
  });

  it('completes the focused onboarding-to-public-site flow with persisted content and media', async () => {
    const state = {
      displayName: 'Novo estabelecimento',
      businessProfile: 'GENERIC' as 'GENERIC' | 'BARBERSHOP',
      publicSite: null as null | Record<string, unknown>,
      branding: null as null | Record<string, unknown>,
      assets: [] as Record<string, unknown>[],
    };
    const transaction = {
      tenant: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          if (typeof data.displayName === 'string') state.displayName = data.displayName;
          if (data.businessProfile === 'BARBERSHOP') state.businessProfile = data.businessProfile;
          return Promise.resolve({
            onboardingStep: data.onboardingStep,
            onboardingCompletedAt: null,
            onboardingChecklistHiddenAt: null,
          });
        }),
      },
      tenantPublicSite: {
        upsert: vi.fn(({ create }: { create: Record<string, unknown> }) => {
          state.publicSite = {
            footerText: null,
            seoTitle: null,
            seoDescription: null,
            pwaDescription: null,
            ...Object.fromEntries(Object.entries(create).filter(([key]) => key !== 'tenantId')),
          };
          return Promise.resolve(state.publicSite);
        }),
      },
    };
    const onboardingClient = {
      tenant: {
        findUniqueOrThrow: vi.fn(() =>
          Promise.resolve({
            slug: 'barbearia-silva',
            slugChangedAt: null,
            businessProfile: state.businessProfile,
            publicSite: state.publicSite,
          }),
        ),
      },
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) =>
        Promise.resolve(operation(transaction)),
      ),
    } as unknown as PrismaClient;

    await updateTenantOnboarding(onboardingClient, tenantId, {
      step: 'BUSINESS_IDENTITY',
      businessProfile: 'BARBERSHOP',
    });
    await updateTenantOnboarding(onboardingClient, tenantId, {
      step: 'BUSINESS_ADDRESS',
      displayName: 'Barbearia Silva',
    });

    const tenantRecord = () => ({
      id: tenantId,
      publicId: '11111111-1111-4111-8111-111111111111',
      slug: 'barbearia-silva',
      displayName: state.displayName,
      businessProfile: state.businessProfile,
      onboardingCompletedAt: null,
      branding: state.branding,
      terminology: null,
      publicSite: state.publicSite,
    });
    const repository = {
      findTenant: vi.fn(() => Promise.resolve(tenantRecord())),
      listAssets: vi.fn(() => Promise.resolve(state.assets)),
      upsertSite: vi.fn((_id: bigint, data: Record<string, unknown>) => {
        state.publicSite = Object.fromEntries(
          Object.entries({ ...state.publicSite, ...data }).filter(([key]) => key !== 'tenantId'),
        );
        return Promise.resolve(state.publicSite);
      }),
      upsertBranding: vi.fn((_id: bigint, data: Record<string, unknown>) => {
        state.branding = data;
        return Promise.resolve(data);
      }),
      replaceKind: vi.fn((_id: bigint, kind: string, data: Record<string, unknown>) => {
        const asset = { ...data, kind, createdAt: new Date('2026-08-11T00:00:00.000Z') };
        state.assets = [asset];
        return Promise.resolve(asset);
      }),
      recordAudit: vi.fn().mockResolvedValue(undefined),
      findPublicTenant: vi.fn(() =>
        Promise.resolve({
          ...tenantRecord(),
          mediaAssets: state.assets,
          services: [],
          professionals: [],
          businessUnits: [],
        }),
      ),
    };
    const storage = {
      save: vi.fn().mockResolvedValue({ key: 'tenant/asset/foto.jpg', mimeType: 'image/jpeg' }),
      remove: vi.fn(),
    };
    const service = new TenantWhiteLabelService(
      repository as never,
      storage as never,
      {} as ServiceImageStorage,
      {} as ServiceImageStorage,
    );
    const actor = { userId: 7n, sessionId: 8n };

    await service.updateSite(tenantId, { theme: 'MODERN' }, actor);
    await service.updateBranding(tenantId, { primaryColor: '#2457D6' }, actor);
    const photo = jpeg(640, 480);
    validateTenantMediaUpload(photo, 'foto.JPEG', 'image/jpg', 'LOGO');
    await service.upload(tenantId, 'LOGO', 'foto.JPEG', photo, actor);
    const publicSite = await service.publicSite('barbearia-silva');

    expect(publicSite).toMatchObject({
      slug: 'barbearia-silva',
      displayName: 'Barbearia Silva',
      site: {
        theme: 'MODERN',
        heroTitle: 'Barbearia Silva',
        heroSubtitle: 'Seu estilo, no seu tempo.',
      },
      branding: { primaryColor: '#2457D6' },
    });
    expect(publicSite.assets).toHaveLength(1);
    expect(() => {
      validateTenantMediaUpload(png(640, 480), 'banner.PNG', 'image/x-png', 'BANNER_DESKTOP');
    }).not.toThrow();
  });
});
