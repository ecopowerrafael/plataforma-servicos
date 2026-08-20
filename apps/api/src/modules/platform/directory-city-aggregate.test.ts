import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshDirectoryCityAggregate } from './directory-city-aggregate.js';

describe('refreshDirectoryCityAggregate', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      directoryBusiness: {
        findMany: vi.fn(),
      },
      directoryCityAggregate: {
        upsert: vi.fn(),
      },
    };
  });

  it('calculates correct aggregates with eligible and whatsapp businesses', async () => {
    const businessDate = new Date('2025-08-20T10:00:00Z');
    mockPrisma.directoryBusiness.findMany.mockResolvedValue([
      { neighborhood: 'Centro', seoEligible: true, whatsapp: '5511999', updatedAt: businessDate },
      { neighborhood: 'Centro', seoEligible: true, whatsapp: null, updatedAt: businessDate },
      { neighborhood: 'Vila', seoEligible: false, whatsapp: '5511888', updatedAt: businessDate },
      { neighborhood: 'Centro', seoEligible: true, whatsapp: '5511777', updatedAt: businessDate },
    ]);

    const categoryId = 1n;
    const citySlug = 'sao-paulo';

    await refreshDirectoryCityAggregate(mockPrisma, categoryId, citySlug);

    expect(mockPrisma.directoryCityAggregate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          udca_category_city: {
            categoryId,
            citySlug,
          },
        },
        update: expect.objectContaining({
          businessCount: 4,
          seoEligibleBusinessCount: 3,
          whatsappCount: 3,
          seoEligible: true, // >= 3 seo_eligible
          topNeighborhoods: expect.arrayContaining([
            expect.objectContaining({ name: 'Centro', count: 3 }),
            expect.objectContaining({ name: 'Vila', count: 1 }),
          ]),
        }),
      })
    );
  });

  it('marks city as not seoEligible when < 3 seo_eligible businesses', async () => {
    const businessDate = new Date('2025-08-20T10:00:00Z');
    mockPrisma.directoryBusiness.findMany.mockResolvedValue([
      { neighborhood: 'Centro', seoEligible: true, whatsapp: '5511999', updatedAt: businessDate },
      { neighborhood: 'Centro', seoEligible: false, whatsapp: null, updatedAt: businessDate },
    ]);

    await refreshDirectoryCityAggregate(mockPrisma, 1n, 'sao-paulo');

    expect(mockPrisma.directoryCityAggregate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          businessCount: 2,
          seoEligibleBusinessCount: 1,
          seoEligible: false, // < 3 seo_eligible
        }),
      })
    );
  });

  it('handles empty city (no businesses)', async () => {
    mockPrisma.directoryBusiness.findMany.mockResolvedValue([]);

    await refreshDirectoryCityAggregate(mockPrisma, 1n, 'empty-city');

    expect(mockPrisma.directoryCityAggregate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          businessCount: 0,
          seoEligibleBusinessCount: 0,
          whatsappCount: 0,
          seoEligible: false,
          topNeighborhoods: [],
          lastBusinessUpdatedAt: null,
        }),
      })
    );
  });

  it('extracts top 12 neighborhoods only', async () => {
    const businessDate = new Date('2025-08-20T10:00:00Z');
    const neighborhoods = Array.from({ length: 20 }, (_, i) => ({
      neighborhood: `Neighborhood${i}`,
      seoEligible: true,
      whatsapp: null,
      updatedAt: businessDate,
    }));

    mockPrisma.directoryBusiness.findMany.mockResolvedValue(neighborhoods);

    await refreshDirectoryCityAggregate(mockPrisma, 1n, 'large-city');

    const call = mockPrisma.directoryCityAggregate.upsert.mock.calls[0][0];
    expect(call.update.topNeighborhoods.length).toBe(12);
  });

  it('sets lastBusinessUpdatedAt to most recent update', async () => {
    const older = new Date('2025-08-20T10:00:00Z');
    const newer = new Date('2025-08-20T15:30:00Z');

    mockPrisma.directoryBusiness.findMany.mockResolvedValue([
      { neighborhood: 'A', seoEligible: true, whatsapp: null, updatedAt: older },
      { neighborhood: 'B', seoEligible: true, whatsapp: null, updatedAt: newer },
      { neighborhood: 'C', seoEligible: false, whatsapp: null, updatedAt: older },
    ]);

    await refreshDirectoryCityAggregate(mockPrisma, 1n, 'city');

    const call = mockPrisma.directoryCityAggregate.upsert.mock.calls[0][0];
    expect(call.update.lastBusinessUpdatedAt).toEqual(newer);
  });
});
