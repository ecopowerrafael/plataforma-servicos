import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  processDirectorySeoEligibilityBatch,
  markCategoryForSeoRecalculation,
} from './directory-seo-backfill.js';

describe('DirectorySEO Backfill', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      directoryBusiness: {
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      directoryCityAggregateJob: {
        upsert: vi.fn(),
      },
    };
  });

  describe('processDirectorySeoEligibilityBatch', () => {
    it('processes unevaluated businesses up to limit', async () => {
      const business = {
        id: 1n,
        active: true,
        indexable: true,
        name: 'Test Business',
        city: 'São Paulo',
        state: 'SP',
        rawAddress: 'Rua X, 123',
        neighborhood: 'Centro',
        postalCode: '01310100',
        phone: '1199999999',
        whatsapp: null,
        websiteUrl: null,
        tenantId: null,
        categoryId: 1n,
        citySlug: 'sao-paulo-sp',
        category: { active: true, indexable: true },
      };

      mockPrisma.directoryBusiness.findMany.mockResolvedValue([business]);
      mockPrisma.directoryBusiness.update.mockResolvedValue({});
      mockPrisma.directoryCityAggregateJob.upsert.mockResolvedValue({ publicId: 'uuid' });

      const result = await processDirectorySeoEligibilityBatch(mockPrisma, 200);

      expect(result.processedCount).toBe(1);
      expect(result.errorCount).toBe(0);
      expect(result.aggregatesEnqueued).toBe(1);
      expect(mockPrisma.directoryBusiness.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seoEvaluatedAt: null },
          take: 200,
        }),
      );
    });

    it('updates business with calculated SEO scores', async () => {
      const business = {
        id: 1n,
        active: true,
        indexable: true,
        name: 'Test',
        city: 'São Paulo',
        state: 'SP',
        rawAddress: 'Addr',
        neighborhood: null,
        postalCode: null,
        phone: '1199999999',
        whatsapp: null,
        websiteUrl: null,
        tenantId: null,
        categoryId: 1n,
        citySlug: 'sao-paulo-sp',
        category: { active: true, indexable: true },
      };

      mockPrisma.directoryBusiness.findMany.mockResolvedValue([business]);
      mockPrisma.directoryBusiness.update.mockResolvedValue({});
      mockPrisma.directoryCityAggregateJob.upsert.mockResolvedValue({ publicId: 'uuid' });

      await processDirectorySeoEligibilityBatch(mockPrisma, 200);

      const updateCall = mockPrisma.directoryBusiness.update.mock.calls[0][0];
      expect(updateCall.data.seoQualityScore).toBeGreaterThan(0);
      expect(updateCall.data.seoEligible).toBeDefined();
      expect(updateCall.data.seoEvaluatedAt).toBeDefined();
    });

    it('respects batch limit', async () => {
      const businesses = Array.from({ length: 300 }, (_, i) => ({
        id: BigInt(i),
        active: true,
        indexable: true,
        name: `Business${i}`,
        city: 'SP',
        state: 'SP',
        rawAddress: 'Addr',
        neighborhood: null,
        postalCode: null,
        phone: '123',
        whatsapp: null,
        websiteUrl: null,
        tenantId: null,
        categoryId: 1n,
        citySlug: 'sp-sp',
        category: { active: true, indexable: true },
      }));

      mockPrisma.directoryBusiness.findMany.mockResolvedValue(businesses.slice(0, 100));
      mockPrisma.directoryBusiness.update.mockResolvedValue({});
      mockPrisma.directoryCityAggregateJob.upsert.mockResolvedValue({ publicId: 'uuid' });

      await processDirectorySeoEligibilityBatch(mockPrisma, 100);

      expect(mockPrisma.directoryBusiness.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('deduplicates city aggregate enqueue', async () => {
      // Same city, should enqueue only once
      const businesses = [
        {
          id: 1n,
          active: true,
          indexable: true,
          name: 'B1',
          city: 'SP',
          state: 'SP',
          rawAddress: 'A',
          neighborhood: null,
          postalCode: null,
          phone: '1',
          whatsapp: null,
          websiteUrl: null,
          tenantId: null,
          categoryId: 1n,
          citySlug: 'sp-sp',
          category: { active: true, indexable: true },
        },
        {
          id: 2n,
          active: true,
          indexable: true,
          name: 'B2',
          city: 'SP',
          state: 'SP',
          rawAddress: 'A',
          neighborhood: null,
          postalCode: null,
          phone: '2',
          whatsapp: null,
          websiteUrl: null,
          tenantId: null,
          categoryId: 1n,
          citySlug: 'sp-sp',
          category: { active: true, indexable: true },
        },
      ];

      mockPrisma.directoryBusiness.findMany.mockResolvedValue(businesses);
      mockPrisma.directoryBusiness.update.mockResolvedValue({});
      mockPrisma.directoryCityAggregateJob.upsert.mockResolvedValue({ publicId: 'uuid' });

      const result = await processDirectorySeoEligibilityBatch(mockPrisma, 200);

      expect(result.processedCount).toBe(2);
      expect(result.aggregatesEnqueued).toBe(1); // Only 1 unique city
    });

    it('counts errors', async () => {
      const business = {
        id: 1n,
        active: true,
        indexable: true,
        name: 'Test',
        city: 'SP',
        state: 'SP',
        rawAddress: 'A',
        neighborhood: null,
        postalCode: null,
        phone: '1',
        whatsapp: null,
        websiteUrl: null,
        tenantId: null,
        categoryId: 1n,
        citySlug: 'sp-sp',
        category: { active: true, indexable: true },
      };

      mockPrisma.directoryBusiness.findMany.mockResolvedValue([business]);
      mockPrisma.directoryBusiness.update.mockRejectedValue(new Error('DB error'));
      mockPrisma.directoryCityAggregateJob.upsert.mockResolvedValue({ publicId: 'uuid' });

      const result = await processDirectorySeoEligibilityBatch(mockPrisma, 200);

      expect(result.errorCount).toBe(1);
      expect(result.processedCount).toBe(0);
    });
  });

  describe('markCategoryForSeoRecalculation', () => {
    it('marks all businesses in category for re-evaluation', async () => {
      mockPrisma.directoryBusiness.updateMany.mockResolvedValue({ count: 150 });

      const result = await markCategoryForSeoRecalculation(mockPrisma, 1n);

      expect(result).toBe(150);
      expect(mockPrisma.directoryBusiness.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: 1n },
          data: { seoEvaluatedAt: null },
        }),
      );
    });

    it('handles empty category', async () => {
      mockPrisma.directoryBusiness.updateMany.mockResolvedValue({ count: 0 });

      const result = await markCategoryForSeoRecalculation(mockPrisma, 999n);

      expect(result).toBe(0);
    });
  });
});
