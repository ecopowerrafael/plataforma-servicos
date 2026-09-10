import type { PrismaClient } from '../../database-client/client.js';

export type PaidAmountConfidence = 'EXACT' | 'LEGACY_MATCHED' | 'AMBIGUOUS';

export async function resolveCurrentCyclePaidAmount(client: PrismaClient, input: { subscriptionId: bigint; periodStartsAt: Date; periodEndsAt: Date; historicalPriceCents: bigint }) {
  const candidates = await client.platformSubscriptionCharge.findMany({
    where: { subscriptionId: input.subscriptionId, status: 'PAID', paidAt: { not: null, gte: input.periodStartsAt, lte: input.periodEndsAt } },
    select: { id: true, publicId: true, amountCents: true, paidAt: true },
    orderBy: { paidAt: 'asc' },
  });
  if (candidates.length === 0) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: [] as string[] };
  if (candidates.length > 1) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: candidates.map((item) => item.publicId) };
  const candidate = candidates[0]!;
  if (candidate.amountCents <= 0n) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: [candidate.publicId] };
  return { amountCents: candidate.amountCents, confidence: candidate.amountCents === input.historicalPriceCents ? 'LEGACY_MATCHED' as const : 'AMBIGUOUS' as const, records: [candidate.publicId] };
}
