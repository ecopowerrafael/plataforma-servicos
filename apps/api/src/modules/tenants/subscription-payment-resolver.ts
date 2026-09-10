import type { PrismaClient } from '../../database-client/client.js';

export type PaidAmountConfidence = 'EXACT' | 'LEGACY_MATCHED' | 'AMBIGUOUS';

export async function resolveCurrentCyclePaidAmount(client: PrismaClient, input: { subscriptionId: bigint; periodStartsAt: Date; periodEndsAt: Date; historicalPriceCents: bigint }) {
  // The amount paid is the confirmed transaction amount, not the plan list
  // price. A single confirmed record may legitimately differ from
  // historicalPriceCents because of discounts or negotiated pricing.
  const [gateway, commercial] = await Promise.all([
    client.platformSubscriptionCharge.findMany({
      where: { subscriptionId: input.subscriptionId, status: 'PAID', paidAt: { not: null, gte: input.periodStartsAt, lte: input.periodEndsAt } },
      select: { publicId: true, amountCents: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    }),
    client.commercialManualPayment.findMany({
      where: { subscriptionId: input.subscriptionId, status: 'PROCESSED', processedAt: { not: null, gte: input.periodStartsAt, lte: input.periodEndsAt } },
      select: { publicId: true, amountCents: true, processedAt: true },
      orderBy: { processedAt: 'asc' },
    }),
  ]);
  const candidates = [
    ...gateway.map((item) => ({ publicId: `gateway:${item.publicId}`, amountCents: item.amountCents, paidAt: item.paidAt })),
    ...commercial.map((item) => ({ publicId: `commercial:${item.publicId}`, amountCents: item.amountCents, paidAt: item.processedAt })),
  ].sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0));
  if (candidates.length === 0) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: [] as string[] };
  if (candidates.length > 1) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: candidates.map((item) => item.publicId) };
  const candidate = candidates[0]!;
  if (candidate.amountCents <= 0n) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: [candidate.publicId] };
  return {
    amountCents: candidate.amountCents,
    confidence: candidate.amountCents === input.historicalPriceCents ? 'LEGACY_MATCHED' as const : 'EXACT' as const,
    records: [candidate.publicId],
  };
}
