import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  enqueueDirectoryCityAggregate,
  processDirectoryCityAggregateJobs,
  getDirectoryCityAggregateJobStats,
} from './directory-city-aggregate-job.js';

describe('DirectoryCityAggregateJob - Persistent Queue', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      directoryCityAggregateJob: {
        upsert: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      directoryBusiness: {
        findMany: vi.fn(),
      },
      directoryCityAggregate: {
        upsert: vi.fn(),
      },
    };
  });

  describe('enqueueDirectoryCityAggregate', () => {
    it('creates a PENDING job idempotently', async () => {
      const publicId = randomUUID();
      mockPrisma.directoryCityAggregateJob.upsert.mockResolvedValue({
        publicId,
        status: 'PENDING',
      });

      const result = await enqueueDirectoryCityAggregate(mockPrisma, 1n, 'sao-paulo');

      expect(result).toBe(publicId);
      expect(mockPrisma.directoryCityAggregateJob.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { pendingKey: '1:sao-paulo' },
          create: expect.objectContaining({
            categoryId: 1n,
            citySlug: 'sao-paulo',
            status: 'PENDING',
            pendingKey: '1:sao-paulo',
          }),
        }),
      );
    });

    it('returns existing job if PENDING already exists (no duplicate)', async () => {
      const existingId = randomUUID();
      mockPrisma.directoryCityAggregateJob.upsert.mockResolvedValue({
        publicId: existingId,
        status: 'PENDING',
      });

      const result1 = await enqueueDirectoryCityAggregate(mockPrisma, 1n, 'sao-paulo');
      const result2 = await enqueueDirectoryCityAggregate(mockPrisma, 1n, 'sao-paulo');

      expect(result1).toBe(result2);
      expect(result1).toBe(existingId);
    });

    it('creates different jobs for different cities', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();

      mockPrisma.directoryCityAggregateJob.upsert
        .mockResolvedValueOnce({ publicId: id1 })
        .mockResolvedValueOnce({ publicId: id2 });

      const result1 = await enqueueDirectoryCityAggregate(mockPrisma, 1n, 'sao-paulo');
      const result2 = await enqueueDirectoryCityAggregate(mockPrisma, 1n, 'rio-janeiro');

      expect(result1).not.toBe(result2);
    });

    it('creates different jobs for different categories', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();

      mockPrisma.directoryCityAggregateJob.upsert
        .mockResolvedValueOnce({ publicId: id1 })
        .mockResolvedValueOnce({ publicId: id2 });

      const result1 = await enqueueDirectoryCityAggregate(mockPrisma, 1n, 'sao-paulo');
      const result2 = await enqueueDirectoryCityAggregate(mockPrisma, 2n, 'sao-paulo');

      expect(result1).not.toBe(result2);
    });
  });

  describe('processDirectoryCityAggregateJobs', () => {
    it('claims PENDING jobs atomically', async () => {
      mockPrisma.directoryCityAggregateJob.findMany.mockResolvedValue([
        {
          id: 1n,
          categoryId: 1n,
          citySlug: 'sao-paulo',
          status: 'PENDING',
          attempts: 0,
        },
      ]);

      mockPrisma.directoryCityAggregateJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.directoryCityAggregateJob.update.mockResolvedValue({});
      mockPrisma.directoryBusiness.findMany.mockResolvedValue([]);

      const result = await processDirectoryCityAggregateJobs(mockPrisma, 10);

      expect(result).toBe(1);
      expect(mockPrisma.directoryCityAggregateJob.updateMany).toHaveBeenCalled();
      const updateManyCall = mockPrisma.directoryCityAggregateJob.updateMany.mock.calls[0][0];
      expect(updateManyCall.data.status).toBe('PROCESSING');
    });

    it('skips job if claim failed (race condition)', async () => {
      mockPrisma.directoryCityAggregateJob.findMany.mockResolvedValue([
        { id: 1n, status: 'PENDING', attempts: 0 },
      ]);

      // Claim fails (someone else already claimed it)
      mockPrisma.directoryCityAggregateJob.updateMany.mockResolvedValue({ count: 0 });

      const result = await processDirectoryCityAggregateJobs(mockPrisma, 10);

      expect(result).toBe(0);
    });

    it('marks job as DONE on success', async () => {
      mockPrisma.directoryCityAggregateJob.findMany.mockResolvedValue([
        { id: 1n, categoryId: 1n, citySlug: 'sp', status: 'PENDING', attempts: 0 },
      ]);

      mockPrisma.directoryCityAggregateJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.directoryBusiness.findMany.mockResolvedValue([]);
      mockPrisma.directoryCityAggregateJob.update.mockResolvedValue({});

      await processDirectoryCityAggregateJobs(mockPrisma, 10);

      expect(mockPrisma.directoryCityAggregateJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DONE',
            pendingKey: null,
            processedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('marks job as FAILED on error with backoff', async () => {
      mockPrisma.directoryCityAggregateJob.findMany.mockResolvedValue([
        { id: 1n, categoryId: 1n, citySlug: 'sp', status: 'PENDING', attempts: 0 },
      ]);

      mockPrisma.directoryCityAggregateJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.directoryBusiness.findMany.mockRejectedValue(new Error('DB error'));

      await processDirectoryCityAggregateJobs(mockPrisma, 10);

      const updateCall = mockPrisma.directoryCityAggregateJob.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('FAILED');
      expect(updateCall.data.attempts).toBe(1);
      expect(updateCall.data.nextAttemptAt).toBeDefined();
      expect(updateCall.data.lastError).toContain('DB error');
    });

    it('respects max attempts (5)', async () => {
      mockPrisma.directoryCityAggregateJob.findMany.mockResolvedValue([
        { id: 1n, categoryId: 1n, citySlug: 'sp', status: 'FAILED', attempts: 4 },
      ]);

      mockPrisma.directoryCityAggregateJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.directoryBusiness.findMany.mockRejectedValue(new Error('Still fails'));

      await processDirectoryCityAggregateJobs(mockPrisma, 10);

      const updateCall = mockPrisma.directoryCityAggregateJob.update.mock.calls[0][0];
      expect(updateCall.data.attempts).toBe(5);
      expect(updateCall.data.nextAttemptAt).toBeNull(); // No more retries
    });

    it('processes up to limit', async () => {
      const candidates = Array.from({ length: 25 }, (_, i) => ({
        id: BigInt(i),
        categoryId: 1n,
        citySlug: `city${i}`,
        status: 'PENDING',
        attempts: 0,
      }));

      mockPrisma.directoryCityAggregateJob.findMany.mockResolvedValue(candidates.slice(0, 10));
      mockPrisma.directoryCityAggregateJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.directoryBusiness.findMany.mockResolvedValue([]);
      mockPrisma.directoryCityAggregateJob.update.mockResolvedValue({});

      const result = await processDirectoryCityAggregateJobs(mockPrisma, 10);

      expect(result).toBe(10);
      expect(mockPrisma.directoryCityAggregateJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('getDirectoryCityAggregateJobStats', () => {
    it('returns job counts', async () => {
      mockPrisma.directoryCityAggregateJob.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(2) // processing
        .mockResolvedValueOnce(1) // failed
        .mockResolvedValueOnce(150); // done

      mockPrisma.directoryCityAggregateJob.findFirst.mockResolvedValue({
        createdAt: new Date('2025-08-20T10:00:00Z'),
      });

      const stats = await getDirectoryCityAggregateJobStats(mockPrisma);

      expect(stats.pendingCount).toBe(5);
      expect(stats.processingCount).toBe(2);
      expect(stats.failedCount).toBe(1);
      expect(stats.processedCount).toBe(150);
      expect(stats.oldestPendingAt).toBeDefined();
    });
  });
});
