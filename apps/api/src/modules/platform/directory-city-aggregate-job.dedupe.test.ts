import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueDirectoryCityAggregate } from './directory-city-aggregate-job.js';

describe('DEDUPE - 100 enqueues same category+city → 1 job', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      directoryCityAggregateJob: {
        upsert: vi.fn(),
      },
    };
  });

  it('100 enqueues para (categoryId=1, citySlug=sao-paulo) = 1 job ativo', async () => {
    const publicId = 'same-uuid';
    let upsertCount = 0;

    mockPrisma.directoryCityAggregateJob.upsert.mockImplementation(async (args: any) => {
      upsertCount++;
      // Simula UPSERT: se já existe com pendingKey, retorna existente
      if (args.where.pendingKey === '1:sao-paulo' && upsertCount > 1) {
        return { publicId, status: 'PENDING' };
      }
      return { publicId, status: 'PENDING' };
    });

    const categoryId = 1n;
    const citySlug = 'sao-paulo';

    // Simula 100 enqueues
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      const jobId = await enqueueDirectoryCityAggregate(mockPrisma, categoryId, citySlug);
      results.push(jobId);
    }

    // Todos retornam mesmo publicId
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(publicId);

    // UPSERT chamado 100 vezes
    expect(mockPrisma.directoryCityAggregateJob.upsert).toHaveBeenCalledTimes(100);

    // Todos com mesma pendingKey
    for (const call of mockPrisma.directoryCityAggregateJob.upsert.mock.calls) {
      expect(call[0].where.pendingKey).toBe('1:sao-paulo');
    }
  });
});
