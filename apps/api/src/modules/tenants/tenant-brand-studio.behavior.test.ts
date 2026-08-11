import { describe, expect, it, vi } from 'vitest';

import { updateTenantIdentity } from './tenant-identity.service.js';
import { validateTenantMediaUpload } from './tenant-media.storage.js';
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
    const unusedStorage = {} as ServiceImageStorage;
    const service = new TenantWhiteLabelService(
      repository as never,
      unusedStorage,
      unusedStorage,
      unusedStorage,
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
});
