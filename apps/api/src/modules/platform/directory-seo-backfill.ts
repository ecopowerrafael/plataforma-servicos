/**
 * DirectorySEO Backfill - Batch recalculation of SEO eligibility.
 *
 * Evaluates businesses where seoEvaluatedAt IS NULL.
 * Enqueues city aggregates for refresh automatically.
 */

import type { PrismaClient } from '../../database-client/client.js';
import { evaluateDirectoryBusinessSeo } from './directory-seo-quality.js';
import { enqueueDirectoryCityAggregate } from './directory-city-aggregate-job.js';

export interface DirectorySeoBackfillStats {
  processedCount: number;
  errorCount: number;
  aggregatesEnqueued: number;
}

/**
 * Process up to `limit` unevaluated businesses.
 *
 * Returns count of successful evaluations.
 */
export async function processDirectorySeoEligibilityBatch(
  prisma: PrismaClient,
  limit: number = 200,
): Promise<DirectorySeoBackfillStats> {
  // Find businesses with seoEvaluatedAt = NULL
  const businesses = await prisma.directoryBusiness.findMany({
    where: {
      seoEvaluatedAt: null as any,
    },
    include: {
      category: { select: { active: true, indexable: true } },
    },
    take: limit,
    orderBy: { id: 'asc' },
  });

  let processedCount = 0;
  let errorCount = 0;
  const citiesToRefresh = new Set<string>();

  for (const business of businesses) {
    try {
      // Evaluate SEO
      const seoEval = evaluateDirectoryBusinessSeo({
        active: business.active,
        indexable: business.indexable,
        name: business.name,
        city: business.city,
        state: business.state,
        rawAddress: business.rawAddress,
        neighborhood: business.neighborhood,
        postalCode: business.postalCode,
        phone: business.phone,
        whatsapp: business.whatsapp,
        websiteUrl: business.websiteUrl,
        tenantId: business.tenantId,
        categoryActive: business.category.active,
        categoryIndexable: business.category.indexable,
      });

      // Update business with SEO scores
      await prisma.directoryBusiness.update({
        where: { id: business.id },
        data: {
          seoQualityScore: seoEval.score,
          seoEligible: seoEval.eligible,
          seoEvaluatedAt: new Date(),
        },
      });

      // Track city for aggregate refresh
      citiesToRefresh.add(`${business.categoryId}:${business.citySlug}`);
      processedCount++;
    } catch (error) {
      console.error(`Error processing business ${business.id}:`, error);
      errorCount++;
    }
  }

  // Enqueue city aggregates for refresh
  let aggregatesEnqueued = 0;
  for (const key of citiesToRefresh) {
    try {
      const parts = key.split(':');
      if (parts.length !== 2) continue;
      const catIdStr = parts[0];
      const citySlug = parts[1];
      if (!catIdStr || !citySlug) continue;
      const catId = BigInt(catIdStr);
      await enqueueDirectoryCityAggregate(prisma, catId, citySlug);
      aggregatesEnqueued++;
    } catch (error) {
      console.error(`Error enqueuing aggregate for ${key}:`, error);
    }
  }

  return {
    processedCount,
    errorCount,
    aggregatesEnqueued,
  };
}

/**
 * Mark all businesses in a category for SEO re-evaluation.
 *
 * Called when category active/indexable status changes.
 */
export async function markCategoryForSeoRecalculation(
  prisma: PrismaClient,
  categoryId: bigint,
): Promise<number> {
  const result = await prisma.directoryBusiness.updateMany({
    where: { categoryId },
    data: {
      seoEvaluatedAt: null, // Mark for re-evaluation
    },
  });

  return result.count;
}
