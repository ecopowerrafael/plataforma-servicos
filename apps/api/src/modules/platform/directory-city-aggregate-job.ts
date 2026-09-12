/**
 * DirectoryCityAggregateJob - Persistent queue for city aggregate refresh.
 *
 * Uses MySQL for durability and deduplication.
 * All operations are idempotent.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../database-client/client.js';
import { refreshDirectoryCityAggregate } from './directory-city-aggregate.js';

export interface DirectoryCityAggregateJobFailedSample {
  categoryId: string;
  citySlug: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
}

export interface DirectoryCityAggregateJobStats {
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  /** attempts < 5: ainda será tentado de novo automaticamente pelo backoff. */
  failedRetryableCount: number;
  /** attempts >= 5: excluído da fila normal; só volta com retry manual. */
  failedPermanentCount: number;
  processedCount: number;
  oldestPendingAt: Date | null;
  /** Amostra (até 10) dos jobs FAILED mais recentes, para diagnóstico da causa. */
  failedSample: DirectoryCityAggregateJobFailedSample[];
}

/**
 * Enqueue a city aggregate refresh idempotently.
 *
 * Returns the job ID (publicId) if created or found existing.
 */
export async function enqueueDirectoryCityAggregate(
  prisma: PrismaClient,
  categoryId: bigint,
  citySlug: string,
): Promise<string> {
  const pendingKey = `${categoryId}:${citySlug}`;

  // Try upsert: if PENDING already exists with this key, return it
  // Otherwise, create PENDING job
  const job = await prisma.directoryCityAggregateJob.upsert({
    where: { pendingKey },
    update: {}, // Keep existing if PENDING found
    create: {
      publicId: randomUUID(),
      categoryId,
      citySlug,
      status: 'PENDING',
      pendingKey,
    },
  });

  return job.publicId;
}

/**
 * Process up to `limit` jobs atomically.
 *
 * Returns number of jobs processed.
 */
export async function processDirectoryCityAggregateJobs(
  prisma: PrismaClient,
  limit: number = 10,
): Promise<number> {
  // Find jobs to process
  const candidates = await prisma.directoryCityAggregateJob.findMany({
    where: {
      OR: [
        { status: 'PENDING' },
        {
          status: 'FAILED',
          nextAttemptAt: { lte: new Date() },
          attempts: { lt: 5 },
        },
      ],
    },
    take: limit,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });

  if (candidates.length === 0) return 0;

  let successCount = 0;

  for (const job of candidates) {
    try {
      // Claim: update status to PROCESSING atomically
      const claimed = await prisma.directoryCityAggregateJob.updateMany({
        where: {
          id: job.id,
          status: job.status, // Ensure no race condition
        },
        data: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
      });

      // If not claimed (someone else got it), skip
      if (claimed.count === 0) continue;

      // Process the refresh
      await refreshDirectoryCityAggregate(prisma, job.categoryId, job.citySlug);

      // Mark as DONE
      await prisma.directoryCityAggregateJob.update({
        where: { id: job.id },
        data: {
          status: 'DONE',
          processedAt: new Date(),
          pendingKey: null, // Release for future updates
          lastError: null,
          attempts: job.attempts + 1,
        },
      });

      successCount++;
    } catch (error) {
      const message = String(error).slice(0, 500);
      const attempts = job.attempts + 1;
      const nextAttemptAt = calculateNextRetry(attempts);

      // Mark as FAILED with backoff
      await prisma.directoryCityAggregateJob.update({
        where: { id: job.id },
        data: {
          status: attempts >= 5 ? 'FAILED' : 'FAILED',
          attempts,
          nextAttemptAt: attempts < 5 ? nextAttemptAt : null,
          lastError: message,
          updatedAt: new Date(),
        },
      });
    }
  }

  return successCount;
}

/**
 * Get statistics about pending/processing/failed jobs.
 */
export async function getDirectoryCityAggregateJobStats(
  prisma: PrismaClient,
): Promise<DirectoryCityAggregateJobStats> {
  const [pending, processing, failedRetryable, failedPermanent, processed, oldest, failedSample] =
    await Promise.all([
      prisma.directoryCityAggregateJob.count({ where: { status: 'PENDING' } }),
      prisma.directoryCityAggregateJob.count({ where: { status: 'PROCESSING' } }),
      prisma.directoryCityAggregateJob.count({ where: { status: 'FAILED', attempts: { lt: 5 } } }),
      prisma.directoryCityAggregateJob.count({ where: { status: 'FAILED', attempts: { gte: 5 } } }),
      prisma.directoryCityAggregateJob.count({ where: { status: 'DONE' } }),
      prisma.directoryCityAggregateJob.findFirst({
        where: { status: 'PENDING' },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.directoryCityAggregateJob.findMany({
        where: { status: 'FAILED' },
        select: { categoryId: true, citySlug: true, attempts: true, lastError: true, nextAttemptAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);

  return {
    pendingCount: pending,
    processingCount: processing,
    failedCount: failedRetryable + failedPermanent,
    failedRetryableCount: failedRetryable,
    failedPermanentCount: failedPermanent,
    processedCount: processed,
    oldestPendingAt: oldest?.createdAt ?? null,
    failedSample: failedSample.map((job) => ({
      categoryId: job.categoryId.toString(),
      citySlug: job.citySlug,
      attempts: job.attempts,
      lastError: job.lastError,
      nextAttemptAt: job.nextAttemptAt,
    })),
  };
}

/**
 * Reseta manualmente os jobs FAILED (retryable ou não) para uma nova
 * tentativa — ação disparada só pelo clique do Super Admin, nunca automática.
 * Não apaga nenhum job; apenas limpa attempts/nextAttemptAt/lastError e
 * devolve o job para PENDING, de onde processDirectoryCityAggregateJobs volta
 * a pegá-lo normalmente.
 */
export async function retryFailedDirectoryCityAggregateJobs(prisma: PrismaClient): Promise<number> {
  const result = await prisma.directoryCityAggregateJob.updateMany({
    where: { status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: null, lastError: null },
  });
  return result.count;
}

/**
 * Calculate next retry time with exponential backoff.
 *
 * 1st: 1 min
 * 2nd: 2 min
 * 3rd: 4 min
 * 4th: 8 min
 * 5th: 16 min
 */
function calculateNextRetry(attemptNumber: number): Date {
  const minutes = Math.pow(2, attemptNumber - 1);
  return new Date(Date.now() + minutes * 60 * 1000);
}
