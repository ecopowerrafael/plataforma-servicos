import { describe, expect, it, vi } from 'vitest';

import { ServiceService } from './service.service.js';

import type { ServiceImageStorage } from './service-image.storage.js';
import type { ServiceRepository } from './service.repository.js';

const tenantId = 7n;
const publicId = '00000000-0000-4000-8000-000000000001';

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    publicId,
    tenantId,
    name: 'Corte',
    description: null,
    imagePath: null,
    imageAlt: null,
    iconKey: null,
    category: null,
    _count: { professionalServices: 0 },
    durationMinutes: 30,
    hasPostServiceBreak: false,
    postServiceBreakMinutes: 0,
    priceCents: 5_000n,
    color: '#2563EB',
    sortOrder: 0,
    active: true,
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    updatedAt: new Date('2026-01-02T12:00:00.000Z'),
    tenant: { publicId: '00000000-0000-4000-8000-0000000000ff' },
    ...overrides,
  };
}

function fixture(overrides: Record<string, unknown> = {}) {
  const update = vi.fn().mockImplementation((_id: bigint, data: Record<string, unknown>) =>
    Promise.resolve(service({ imagePath: data.imagePath ?? null })),
  );
  const repository = {
    find: vi.fn().mockResolvedValue(service()),
    findWithTenant: vi.fn().mockResolvedValue(service()),
    update,
    recordAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ServiceRepository;
  const save = vi
    .fn()
    .mockResolvedValue({ key: 'tenant/servico/imagem.webp', mimeType: 'image/webp' });
  const read = vi.fn().mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'image/webp' });
  const removeImage = vi.fn().mockResolvedValue(undefined);
  const images = { save, read, remove: removeImage } as unknown as ServiceImageStorage;
  return {
    service: new ServiceService(repository, images),
    repository,
    save,
    read,
    removeImage,
    update,
  };
}

describe('imagem do serviço', () => {
  it('persiste a imagem no serviço e expõe a URL do próprio serviço', async () => {
    const { service: sut, save, update } = fixture();
    const result = await sut.replaceImage(tenantId, publicId, Buffer.from('imagem'), {
      userId: 1n,
      sessionId: 2n,
    });
    expect(save).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-0000000000ff',
      publicId,
      expect.any(Buffer),
    );
    expect(update).toHaveBeenCalledWith(1n, { imagePath: 'tenant/servico/imagem.webp' });
    expect(result.imageUrl).toBe(`/tenant/services/${publicId}/image`);
  });

  it('descarta o arquivo novo se a persistência falhar', async () => {
    const { service: sut, removeImage } = fixture({
      update: vi.fn().mockRejectedValue(new Error('falha')),
    });
    await expect(
      sut.replaceImage(tenantId, publicId, Buffer.from('imagem'), { userId: 1n, sessionId: 2n }),
    ).rejects.toThrow('falha');
    expect(removeImage).toHaveBeenCalledWith('tenant/servico/imagem.webp');
  });

  it('remove a imagem e limpa o vínculo, mantendo o serviço', async () => {
    const { service: sut, removeImage, update } = fixture({
      find: vi.fn().mockResolvedValue(service({ imagePath: 'tenant/servico/imagem.webp' })),
    });
    const result = await sut.removeImage(tenantId, publicId, { userId: 1n, sessionId: 2n });
    expect(update).toHaveBeenCalledWith(1n, { imagePath: null });
    expect(removeImage).toHaveBeenCalledWith('tenant/servico/imagem.webp');
    expect(result.imageUrl).toBeNull();
  });

  it('não vaza imagem de outro estabelecimento', async () => {
    const find = vi.fn().mockResolvedValue(null);
    const { service: sut, read } = fixture({ find });
    await expect(sut.getImage(tenantId, publicId)).rejects.toMatchObject({
      code: 'SERVICE_NOT_FOUND',
      statusCode: 404,
    });
    expect(find).toHaveBeenCalledWith(tenantId, publicId);
    expect(read).not.toHaveBeenCalled();
  });
});
