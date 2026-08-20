/**
 * DirectoryCityAggregate refresh function.
 *
 * Aggregates business data per city/category combination.
 * Called after business CREATE/UPDATE operations.
 */

export interface CityAggregateData {
  businessCount: number;
  seoEligibleBusinessCount: number;
  whatsappCount: number;
  topNeighborhoods: Array<{ name: string; count: number }>;
  seoEligible: boolean;
}

export async function refreshDirectoryCityAggregate(
  prisma: any,
  categoryId: bigint,
  citySlug: string
): Promise<void> {
  // Query all active businesses in this city/category
  const businesses = await prisma.directoryBusiness.findMany({
    where: {
      categoryId,
      citySlug,
      active: true,
    },
    select: {
      neighborhood: true,
      seoEligible: true,
      whatsapp: true,
      updatedAt: true,
    },
  });

  // Calculate aggregates
  const businessCount = businesses.length;
  const seoEligibleBusinessCount = businesses.filter((b: any) => b.seoEligible).length;
  const whatsappCount = businesses.filter((b: any) => b.whatsapp).length;

  // Extract top neighborhoods (top 12)
  const neighborhoodCounts: Record<string, number> = {};
  businesses.forEach((b: any) => {
    if (b.neighborhood) {
      neighborhoodCounts[b.neighborhood] = (neighborhoodCounts[b.neighborhood] || 0) + 1;
    }
  });

  const topNeighborhoods = Object.entries(neighborhoodCounts)
    .map(([name, count]: [string, number]) => ({ name, count }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 12);

  // Determine if city aggregate is SEO eligible (>= 3 seo_eligible businesses)
  const seoEligible = seoEligibleBusinessCount >= 3;

  // Get latest business update timestamp
  const lastBusinessUpdatedAt =
    businesses.length > 0
      ? businesses.reduce(
          (latest: any, b: any) => (b.updatedAt > latest ? b.updatedAt : latest),
          businesses[0]!.updatedAt,
        )
      : null;

  // Upsert into DirectoryCityAggregate
  await prisma.directoryCityAggregate.upsert({
    where: {
      udca_category_city: {
        categoryId,
        citySlug,
      },
    },
    update: {
      businessCount,
      seoEligibleBusinessCount,
      whatsappCount,
      topNeighborhoods,
      seoEligible,
      lastBusinessUpdatedAt,
      updatedAt: new Date(),
    },
    create: {
      categoryId,
      citySlug,
      city: '', // Will be populated from first business or fallback
      state: '', // Will be populated from first business or fallback
      businessCount,
      seoEligibleBusinessCount,
      whatsappCount,
      topNeighborhoods,
      seoEligible,
      lastBusinessUpdatedAt,
    },
  });
}
