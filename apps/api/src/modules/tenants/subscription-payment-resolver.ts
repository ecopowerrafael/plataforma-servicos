import type { PrismaClient } from '../../database-client/client.js';

export type PaidAmountConfidence = 'EXACT' | 'LEGACY_MATCHED' | 'AMBIGUOUS';

type Candidate = { publicId: string; amountCents: bigint; paidAt: Date | null };

export async function resolveCurrentCyclePaidAmount(client: PrismaClient, input: { subscriptionId: bigint; periodStartsAt: Date; periodEndsAt: Date; historicalPriceCents: bigint; explicitlyLinkedRecordIds?: string[] }) {
  const [gateway, commercial] = await Promise.all([
    client.platformSubscriptionCharge.findMany({
      where: { subscriptionId: input.subscriptionId, status: 'PAID' },
      select: { publicId: true, amountCents: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    }),
    client.commercialManualPayment.findMany({
      where: { subscriptionId: input.subscriptionId, status: 'PROCESSED' },
      select: { publicId: true, amountCents: true, processedAt: true },
      orderBy: { processedAt: 'asc' },
    }),
  ]);
  const allCandidates: Candidate[] = [
    ...gateway.map((item) => ({ publicId: `gateway:${item.publicId}`, amountCents: item.amountCents, paidAt: item.paidAt })),
    ...commercial.map((item) => ({ publicId: `commercial:${item.publicId}`, amountCents: item.amountCents, paidAt: item.processedAt })),
  ];
  const candidates = allCandidates.filter((item) => item.amountCents > 0n && item.paidAt !== null);
  if (candidates.length === 0) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: [] as string[] };
  if (candidates.length > 1) return { amountCents: 0n, confidence: 'AMBIGUOUS' as const, records: candidates.map((item) => item.publicId) };
  const candidate = candidates[0]!;
  const explicitlyLinked = input.explicitlyLinkedRecordIds?.includes(candidate.publicId) ?? false;
  return {
    amountCents: candidate.amountCents,
    // A payment is EXACT only when the persistence model supplies an explicit
    // cycle/change reference. Current legacy tables do not, so a lone
    // confirmed payment is never promoted to EXACT based on its amount.
    confidence: explicitlyLinked ? 'EXACT' as const : 'LEGACY_MATCHED' as const,
    records: [candidate.publicId],
  };
}
