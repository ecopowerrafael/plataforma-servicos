import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectAppIcon, renderAppIcon } from './tenant-media.storage.js';
import { TenantWhiteLabelService } from './tenant-white-label.service.js';
import { inspectServiceImage } from '../services/service-image.storage.js';

import type { TenantMediaStorage } from './tenant-media.storage.js';
import type { TenantWhiteLabelRepository } from './tenant-white-label.repository.js';

async function png(width: number, height: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: { width, height, channels: 4, background: { r: 20, g: 80, b: 60, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

const APP_ICON_ASSET = {
  id: 10n,
  publicId: 'asset-uuid',
  kind: 'APP_ICON',
  storageKey: 'tenant/icon.png',
  deletedAt: null,
};

function buildService(icon: Buffer | null, assets = icon === null ? [] : [APP_ICON_ASSET]) {
  const tenant = {
    id: 1n,
    publicId: 'tenant-uuid',
    slug: 'barbearia',
    displayName: 'Barbearia Silva',
    status: 'ACTIVE',
    branding: { primaryColor: '#123456', backgroundColor: '#ffffff' },
    publicSite: { pwaName: 'Barbearia Silva', pwaStatus: 'DRAFT', pwaPublishedAt: null },
    mediaAssets: assets,
  };
  const repository = {
    findTenant: () => Promise.resolve(tenant),
    findPublicTenant: () => Promise.resolve(tenant),
    listAssets: () => Promise.resolve(assets),
    upsertPwaStatus: () => Promise.resolve(undefined),
    findPwaState: () => Promise.resolve({ status: 'DRAFT', publishedAt: null }),
    findAsset: () => Promise.resolve(assets[0] ?? null),
    deleteAsset: () => Promise.resolve(undefined),
    recordAudit: () => Promise.resolve(undefined),
  } as unknown as TenantWhiteLabelRepository;
  // Storage em memória com o mesmo contrato do LocalTenantMediaStorage:
  // `appIconDerivative` gera na primeira chamada e reaproveita nas seguintes.
  const derivatives = new Map<string, Buffer>();
  const renders: number[] = [];
  const storage = {
    read: () =>
      icon === null
        ? Promise.reject(new Error('sem arquivo'))
        : Promise.resolve({ buffer: icon, mimeType: 'image/png' as const }),
    appIconDerivative: async (key: string, size: 192 | 512, image: Buffer) => {
      const cacheKey = `${key}.${String(size)}`;
      const cached = derivatives.get(cacheKey);
      if (cached !== undefined) return cached;
      renders.push(size);
      const rendered = await renderAppIcon(image, size);
      derivatives.set(cacheKey, rendered);
      return rendered;
    },
    removeAppIconDerivatives: (key: string) => {
      for (const size of [192, 512]) derivatives.delete(`${key}.${String(size)}`);
      return Promise.resolve();
    },
  } as unknown as TenantMediaStorage;
  const service = new TenantWhiteLabelService(repository, storage, {} as never, {} as never);
  // `publicSite` agrega serviços, unidades e disponibilidade — fora do escopo
  // destes testes, que cobrem ícone/manifest.
  Object.assign(service, {
    publicSite: () =>
      Promise.resolve({
        slug: tenant.slug,
        displayName: tenant.displayName,
        branding: { primaryColor: '#123456', backgroundColor: '#ffffff' },
        site: {
          pwaName: 'Barbearia Silva',
          pwaShortName: 'Barbearia',
          pwaDescription: null,
          seoDescription: null,
        },
        assets: [],
      }),
  });
  return Object.assign(service, { derivatives, renders });
}

const actor = { userId: 1n, sessionId: 1n };

describe('inspeção do APP_ICON', () => {
  it('reprova ícone menor que 512x512', async () => {
    const inspection = inspectAppIcon(await png(300, 300));
    expect(inspection).toMatchObject({ square: true, largeEnough: false, valid: false });
  });

  it('aprova ícone quadrado de 512x512', async () => {
    expect(inspectAppIcon(await png(512, 512)).valid).toBe(true);
  });

  it('reprova ícone não quadrado', async () => {
    const inspection = inspectAppIcon(await png(800, 600));
    expect(inspection).toMatchObject({ square: false, valid: false });
  });
});

describe('derivados do ícone', () => {
  it('gera PNG exatamente 192x192 e 512x512 a partir de 1024x1024', async () => {
    const original = await png(1024, 1024);
    for (const size of [192, 512] as const) {
      const derived = await renderAppIcon(original, size);
      const detected = inspectServiceImage(derived);
      expect(detected).toMatchObject({ width: size, height: size, mimeType: 'image/png' });
    }
    // O original permanece intacto: a derivação não escreve no storage.
    expect(inspectServiceImage(original).width).toBe(1024);
  });

  it('serve os derivados sem exigir novo upload de um APP_ICON já salvo', async () => {
    const service = buildService(await png(512, 512));
    const small = await service.appIcon('barbearia', 192);
    const large = await service.appIcon('barbearia', 512);

    expect(small.mimeType).toBe('image/png');
    expect(inspectServiceImage(small.buffer).width).toBe(192);
    expect(inspectServiceImage(large.buffer).width).toBe(512);
  });
});

describe('cache dos derivados', () => {
  it('gera na primeira requisição e reaproveita nas seguintes', async () => {
    const service = buildService(await png(512, 512));
    const first = await service.appIcon('barbearia', 192);
    const second = await service.appIcon('barbearia', 192);

    expect(service.renders).toEqual([192]);
    expect(second.buffer.equals(first.buffer)).toBe(true);
  });

  it('cada tamanho tem seu próprio derivado', async () => {
    const service = buildService(await png(512, 512));
    await service.appIcon('barbearia', 192);
    await service.appIcon('barbearia', 512);
    await service.appIcon('barbearia', 512);

    expect(service.renders).toEqual([192, 512]);
    expect(service.derivatives.size).toBe(2);
  });

  it('descarta os derivados quando o APP_ICON é removido', async () => {
    const service = buildService(await png(512, 512));
    await service.appIcon('barbearia', 192);
    await service.deleteAsset(1n, 'asset-uuid', actor);

    expect(service.derivatives.size).toBe(0);
    await service.appIcon('barbearia', 192);
    expect(service.renders).toEqual([192, 192]);
  });
});

describe('checklist de publicação', () => {
  it('reprova e impede publicar com ícone 300x300', async () => {
    const service = buildService(await png(300, 300));
    const pwa = await service.pwa(1n);

    expect(pwa.checklist).toMatchObject({ icon: true, iconMinimumSize: false, iconSquare: true });
    expect(pwa.ready).toBe(false);
    expect(pwa.iconMessage).toBe(
      'Para publicar o aplicativo, envie um ícone quadrado de pelo menos 512×512 px.',
    );
    await expect(service.publishPwa(1n, actor)).rejects.toMatchObject({
      code: 'TENANT_PWA_NOT_READY',
    });
  });

  it('reprova e impede publicar com ícone 800x600', async () => {
    const service = buildService(await png(800, 600));
    const pwa = await service.pwa(1n);

    expect(pwa.checklist.iconSquare).toBe(false);
    expect(pwa.ready).toBe(false);
    await expect(service.publishPwa(1n, actor)).rejects.toMatchObject({
      code: 'TENANT_PWA_NOT_READY',
    });
  });

  it('aprova com ícone 512x512 e permite publicar', async () => {
    const service = buildService(await png(512, 512));
    const pwa = await service.pwa(1n);

    expect(pwa.checklist).toMatchObject({
      appName: true,
      publicPage: true,
      icon: true,
      iconSquare: true,
      iconMinimumSize: true,
      iconDerivatives: true,
      branding: true,
    });
    expect(pwa.ready).toBe(true);
    expect(pwa.iconMessage).toBeNull();
    await expect(service.publishPwa(1n, actor)).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('marca o requisito como pendente quando não há APP_ICON', async () => {
    const service = buildService(null);
    const pwa = await service.pwa(1n);

    expect(pwa.checklist.icon).toBe(false);
    expect(pwa.ready).toBe(false);
  });
});

describe('manifest', () => {
  it('declara um arquivo real por tamanho', async () => {
    const service = buildService(await png(1024, 1024));
    const manifest = await service.manifest('barbearia');

    expect(manifest.icons).toEqual([
      {
        src: '/public/sites/barbearia/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/public/sites/barbearia/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ]);
    // Nunca declarar vários tamanhos para o mesmo arquivo.
    for (const icon of manifest.icons) expect(icon.sizes).not.toContain(' ');

    for (const icon of manifest.icons) {
      const size = Number(icon.sizes.split('x')[0]);
      const served = await service.appIcon('barbearia', size === 512 ? 512 : 192);
      expect(inspectServiceImage(served.buffer).width).toBe(size);
    }
  });

  it('não declara ícones quando o APP_ICON é inválido', async () => {
    const service = buildService(await png(300, 300));
    expect((await service.manifest('barbearia')).icons).toEqual([]);
  });
});

describe('persistência no storage real', () => {
  it('grava o derivado ao lado do original e o reutiliza', async () => {
    const root = await mkdtemp(join(tmpdir(), 'app-icon-'));
    process.env.TENANT_MEDIA_STORAGE_DIR = root;
    const { LocalTenantMediaStorage } = await import('./tenant-media.storage.js');
    const storage = new LocalTenantMediaStorage();
    const original = await png(1024, 1024);
    const stored = await storage.save('tenant-uuid', 'asset-uuid', original);

    const first = await storage.appIconDerivative(stored.key, 192, original);
    const path = join(root, `${stored.key}.192.png`);
    expect(existsSync(path)).toBe(true);
    expect(inspectServiceImage(readFileSync(path)).width).toBe(192);

    // A segunda chamada lê o arquivo: passar um buffer diferente não muda nada.
    const second = await storage.appIconDerivative(stored.key, 192, await png(512, 512));
    expect(second.equals(first)).toBe(true);

    await storage.removeAppIconDerivatives(stored.key);
    expect(existsSync(path)).toBe(false);
    // O original continua intacto.
    expect(inspectServiceImage((await storage.read(stored.key)).buffer).width).toBe(1024);
    await rm(root, { recursive: true, force: true });
    delete process.env.TENANT_MEDIA_STORAGE_DIR;
  });
});

describe('cold start', () => {
  it('não carrega sharp de forma estática no caminho do listen', () => {
    const files = [
      'tenant-media.storage.ts',
      '../services/service-image.storage.ts',
      'tenant-white-label.service.ts',
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/^import sharp/mu);
      expect(source).not.toMatch(/from 'sharp'/u);
    }
    const storage = readFileSync(new URL('tenant-media.storage.ts', import.meta.url), 'utf8');
    expect(storage).toContain("await import('sharp')");
  });
});
