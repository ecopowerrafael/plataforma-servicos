import { describe, expect, it, vi } from 'vitest';

import { ServiceCategoryService } from './service-category.service.js';

const category = {
  id: 91n,
  publicId: '11111111-1111-4111-8111-111111111111',
  tenantId: 41n,
  name: 'Cabelo',
  description: null,
  color: '#2563EB',
  icon: null,
  sortOrder: 0,
  active: true,
  createdAt: new Date('2026-08-11T12:00:00.000Z'),
  updatedAt: new Date('2026-08-11T12:00:00.000Z'),
  _count: { services: 0 },
};

describe('ServiceCategoryService', () => {
  it('returns the created category and lists it without leaking internal database fields', async () => {
    const repository = {
      create: vi.fn().mockResolvedValue(category),
      list: vi.fn().mockResolvedValue({ total: 1, categories: [category] }),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ServiceCategoryService(repository as never);

    const created = await service.create(41n, {
      name: 'Cabelo',
      description: null,
      color: '#2563EB',
      icon: null,
      sortOrder: 0,
      active: true,
    });
    const listed = await service.list(41n, { page: 1, limit: 100 });

    expect(created).toMatchObject({
      publicId: category.publicId,
      name: 'Cabelo',
      color: '#2563EB',
    });
    expect(created).not.toHaveProperty('id');
    expect(created).not.toHaveProperty('tenantId');
    expect(listed.items).toEqual([created]);
    expect(listed.page.total).toBe(1);
    const createInput = repository.create.mock.calls[0]?.[0] as Record<string, unknown>;
    const listWhere = repository.list.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(createInput).toMatchObject({ tenantId: 41n, name: 'Cabelo' });
    expect(listWhere).toMatchObject({ tenantId: 41n });
    expect(repository.list.mock.calls[0]?.slice(1)).toEqual([1, 100]);
  });

  it('deletes a category by tenant-scoped internal id and records the audit', async () => {
    const linkedCategory = { ...category, _count: { services: 2 } };
    const repository = {
      find: vi.fn().mockResolvedValue(linkedCategory),
      delete: vi.fn().mockResolvedValue(undefined),
      recordAudit: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ServiceCategoryService(repository as never);

    await expect(service.delete(41n, category.publicId, { userId: 7n, sessionId: 8n })).resolves.toEqual({ success: true });
    expect(repository.find).toHaveBeenCalledWith(41n, category.publicId);
    expect(repository.delete).toHaveBeenCalledWith(category.id);
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'service_category.deleted',
      targetType: 'service_category',
      targetPublicId: category.publicId,
    }));
  });

  it('returns not found for a missing category, including another tenant', async () => {
    const repository = { find: vi.fn().mockResolvedValue(null), delete: vi.fn(), recordAudit: vi.fn() };
    const service = new ServiceCategoryService(repository as never);

    await expect(service.delete(999n, category.publicId)).rejects.toMatchObject({
      code: 'SERVICE_CATEGORY_NOT_FOUND',
      statusCode: 404,
    });
    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.recordAudit).not.toHaveBeenCalled();
  });
});
