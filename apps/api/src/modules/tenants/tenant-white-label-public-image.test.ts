import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { publicTenantWhiteLabelRoutes } from './tenant-white-label.routes.js';
import { TenantWhiteLabelService } from './tenant-white-label.service.js';
import type { TenantMediaStorage } from './tenant-media.storage.js';
import type { ServiceImageStorage } from '../services/service-image.storage.js';

describe('Public Combo Image Endpoint', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const repository = {
      findPublicComboImage: vi.fn(),
      listAssets: vi.fn().mockResolvedValue([]),
      findPwaState: vi.fn().mockResolvedValue({ status: 'DRAFT', publishedAt: null }),
    };

    const imageStorage = {
      read: vi.fn(),
    } as any as ServiceImageStorage;

    const mediaStorage = {} as TenantMediaStorage;

    const service = new TenantWhiteLabelService(
      repository as never,
      imageStorage,
      mediaStorage,
      mediaStorage,
    );

    app = Fastify({ logger: false });
    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    typedApp.setValidatorCompiler(validatorCompiler);
    typedApp.setSerializerCompiler(serializerCompiler);

    await typedApp.register(publicTenantWhiteLabelRoutes, { service });
  });

  it('returns 200 for existing active combo image', async () => {
    const mockRepository = await (app as any).repository;
    mockRepository.findPublicComboImage.mockResolvedValueOnce({
      imagePath: 'path/to/combo-image.jpg',
    });

    // Mock the image storage to return image data
    const mockImageStorage = await (app as any).imageStorage;
    mockImageStorage.read.mockResolvedValueOnce(Buffer.from('image-data'));

    const response = await app.inject({
      method: 'GET',
      url: '/public/combos/combo-123/image?variant=thumbnail',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image');
  });

  it('returns 404 for non-existent combo', async () => {
    const mockRepository = await (app as any).repository;
    mockRepository.findPublicComboImage.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/public/combos/nonexistent-combo/image',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when combo image path is null', async () => {
    const mockRepository = await (app as any).repository;
    mockRepository.findPublicComboImage.mockResolvedValueOnce({
      imagePath: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/public/combos/combo-no-image/image',
    });

    expect(response.statusCode).toBe(404);
  });

  it('does not require authentication for public combo image', async () => {
    const mockRepository = await (app as any).repository;
    mockRepository.findPublicComboImage.mockResolvedValueOnce({
      imagePath: 'path/to/image.jpg',
    });

    const mockImageStorage = await (app as any).imageStorage;
    mockImageStorage.read.mockResolvedValueOnce(Buffer.from('image-data'));

    // No auth headers needed
    const response = await app.inject({
      method: 'GET',
      url: '/public/combos/combo-123/image',
      // No cookies or auth headers
    });

    expect([200, 404]).toContain(response.statusCode); // Should work without auth
  });
});
