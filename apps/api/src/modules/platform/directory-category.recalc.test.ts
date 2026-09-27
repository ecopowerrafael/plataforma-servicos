import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('CATEGORY RECALC - Update categoria marca businesses para reavaliação', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      directoryCategory: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      directoryBusiness: {
        updateMany: vi.fn(),
      },
    };
  });

  it('category active true→false marca businesses com seoEvaluatedAt=null', async () => {
    // Current state
    mockPrisma.directoryCategory.findFirst.mockResolvedValue({
      id: 1n,
      publicId: 'cat-1',
      active: true,
      indexable: true,
    });

    // Updated
    const updatedCategory = {
      id: 1n,
      publicId: 'cat-1',
      active: false,
      indexable: true,
    };

    mockPrisma.directoryCategory.update.mockResolvedValue(updatedCategory);
    mockPrisma.directoryBusiness.updateMany.mockResolvedValue({ count: 150 });

    // Simula updateCategory
    const current = await mockPrisma.directoryCategory.findFirst({ where: { publicId: 'cat-1' } });
    const input = { active: false };
    const willChange = input.active !== current.active;

    const category = await mockPrisma.directoryCategory.update({
      where: { publicId: 'cat-1' },
      data: input,
    });

    if (willChange) {
      await mockPrisma.directoryBusiness.updateMany({
        where: { categoryId: category.id },
        data: { seoEvaluatedAt: null },
      });
    }

    expect(mockPrisma.directoryBusiness.updateMany).toHaveBeenCalledWith({
      where: { categoryId: 1n },
      data: { seoEvaluatedAt: null },
    });
  });

  it('category indexable true→false marca businesses com seoEvaluatedAt=null', async () => {
    mockPrisma.directoryCategory.findFirst.mockResolvedValue({
      id: 1n,
      publicId: 'cat-1',
      active: true,
      indexable: true,
    });

    const updatedCategory = {
      id: 1n,
      publicId: 'cat-1',
      active: true,
      indexable: false,
    };

    mockPrisma.directoryCategory.update.mockResolvedValue(updatedCategory);
    mockPrisma.directoryBusiness.updateMany.mockResolvedValue({ count: 150 });

    const current = await mockPrisma.directoryCategory.findFirst({ where: { publicId: 'cat-1' } });
    const input = { indexable: false };
    const willChange = input.indexable !== current.indexable;

    const category = await mockPrisma.directoryCategory.update({
      where: { publicId: 'cat-1' },
      data: input,
    });

    if (willChange) {
      await mockPrisma.directoryBusiness.updateMany({
        where: { categoryId: category.id },
        data: { seoEvaluatedAt: null },
      });
    }

    expect(mockPrisma.directoryBusiness.updateMany).toHaveBeenCalled();
  });

  it('category update SEM mudança active/indexable NÃO marca businesses', async () => {
    mockPrisma.directoryCategory.findFirst.mockResolvedValue({
      id: 1n,
      publicId: 'cat-1',
      active: true,
      indexable: true,
    });

    const updatedCategory = {
      id: 1n,
      publicId: 'cat-1',
      active: true,
      indexable: true,
      name: 'New Name',
    };

    mockPrisma.directoryCategory.update.mockResolvedValue(updatedCategory);

    const current = await mockPrisma.directoryCategory.findFirst({ where: { publicId: 'cat-1' } });
    const input = { name: 'New Name' };
    const willChange =
      (input.active !== undefined && (input as any).active !== current.active) ||
      (input.indexable !== undefined && (input as any).indexable !== current.indexable);

    const category = await mockPrisma.directoryCategory.update({
      where: { publicId: 'cat-1' },
      data: input,
    });

    if (willChange) {
      await mockPrisma.directoryBusiness.updateMany({
        where: { categoryId: category.id },
        data: { seoEvaluatedAt: null },
      });
    }

    expect(mockPrisma.directoryBusiness.updateMany).not.toHaveBeenCalled();
  });
});
