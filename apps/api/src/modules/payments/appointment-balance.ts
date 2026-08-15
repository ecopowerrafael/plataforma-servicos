import { type PrismaClient } from '../../database-client/client.js';

/**
 * Fonte única do valor devido de um agendamento.
 *
 * A regra é a que o domínio já praticava no PaymentService: o preço do atendimento menos
 * os descontos realmente aplicados (cupom ativo e resgate de fidelidade em vigor), e o saldo
 * é o que falta pagar considerando apenas pagamentos confirmados. Cobrança pendente,
 * pagamento cancelado e estorno não reduzem saldo.
 */
export const netPriceCents = (priceCents: bigint, discountCents: bigint) =>
  priceCents > discountCents ? priceCents - discountCents : 0n;

export const balanceCents = (priceCents: bigint, discountCents: bigint, paidCents: bigint) => {
  const net = netPriceCents(priceCents, discountCents);
  return net > paidCents ? net - paidCents : 0n;
};

/**
 * Descontos ativos por agendamento, em duas consultas — nunca uma por agendamento.
 * Cupom cancelado e resgate de fidelidade já encerrado não contam, exatamente como
 * `CouponService.discountForAppointment` e `LoyaltyService.discountForAppointment`.
 */
export async function discountsByAppointment(
  client: PrismaClient,
  tenantId: bigint,
  appointmentIds: bigint[],
): Promise<Map<bigint, bigint>> {
  const discounts = new Map<bigint, bigint>();
  if (appointmentIds.length === 0) return discounts;
  const [coupons, loyalty] = await Promise.all([
    client.couponRedemption.groupBy({
      by: ['appointmentId'],
      where: { tenantId, appointmentId: { in: appointmentIds }, canceledAt: null },
      _sum: { discountAmountCents: true },
    }),
    client.loyaltyLedgerEntry.findMany({
      where: {
        tenantId,
        sourceAppointmentId: { in: appointmentIds },
        reason: 'REDEEMED',
        closesEntry: null,
      },
      select: { sourceAppointmentId: true, discountCentsApplied: true },
    }),
  ]);
  for (const entry of coupons)
    discounts.set(entry.appointmentId, entry._sum.discountAmountCents ?? 0n);
  for (const entry of loyalty) {
    if (entry.sourceAppointmentId === null) continue;
    discounts.set(
      entry.sourceAppointmentId,
      (discounts.get(entry.sourceAppointmentId) ?? 0n) + (entry.discountCentsApplied ?? 0n),
    );
  }
  return discounts;
}

/** Total confirmado por agendamento: apenas `Payment.status = PAID`. */
export async function paidByAppointment(
  client: PrismaClient,
  tenantId: bigint,
  appointmentIds: bigint[],
): Promise<Map<bigint, bigint>> {
  const paid = new Map<bigint, bigint>();
  if (appointmentIds.length === 0) return paid;
  const grouped = await client.payment.groupBy({
    by: ['appointmentId'],
    where: { tenantId, appointmentId: { in: appointmentIds }, status: 'PAID' },
    _sum: { amountCents: true },
  });
  for (const entry of grouped) paid.set(entry.appointmentId, entry._sum.amountCents ?? 0n);
  return paid;
}
