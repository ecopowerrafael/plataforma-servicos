import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

export class CommercialRemittanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { commercialAccountId: bigint; tenantId: bigint; amountCents: bigint; paymentMethod: string; proofReference?: string; paymentPublicIds: string[] }) {
    if (input.amountCents <= 0n || input.paymentPublicIds.length === 0) throw new AppError({ code: 'COMMERCIAL_REMITTANCE_INVALID', message: 'Repasse e pagamentos vinculados são obrigatórios.', statusCode: 400 });
    return this.prisma.$transaction(async (tx) => {
      // Serialize allocations for the same received payments. Without these
      // row locks two remittances could both observe the same available amount.
      for (const paymentPublicId of input.paymentPublicIds) {
        await tx.$executeRaw`SELECT id FROM commercial_manual_payments WHERE public_id = ${paymentPublicId} FOR UPDATE`;
      }
      const payments = await tx.commercialManualPayment.findMany({ where: { publicId: { in: input.paymentPublicIds }, tenantId: input.tenantId, managerAccountId: input.commercialAccountId, receiverType: 'REPRESENTATIVE', status: 'PROCESSED' } });
      if (payments.length !== input.paymentPublicIds.length) throw new AppError({ code: 'COMMERCIAL_REMITTANCE_PAYMENT_INVALID', message: 'Um ou mais pagamentos não pertencem à conta ou já não estão válidos.', statusCode: 409 });
      const allocated = await tx.commercialRemittanceAllocation.aggregate({ where: { manualPaymentId: { in: payments.map((p) => p.id) }, remittance: { status: 'CONFIRMED' } }, _sum: { amountCents: true } });
      const already = allocated._sum.amountCents ?? 0n;
      const commissions = await tx.commercialCommission.findMany({ where: { paymentId: { in: payments.map((p) => p.publicId) }, status: { not: 'REVERSED' } }, select: { paymentId: true, commissionAmountCents: true } });
      const commissionByPayment = new Map<string, bigint>();
      for (const commission of commissions) if (commission.paymentId) commissionByPayment.set(commission.paymentId, (commissionByPayment.get(commission.paymentId) ?? 0n) + commission.commissionAmountCents);
      const paymentTotal = payments.reduce((sum, p) => sum + p.amountCents - (commissionByPayment.get(p.publicId) ?? 0n), 0n);
      if (already + input.amountCents > paymentTotal) throw new AppError({ code: 'COMMERCIAL_REMITTANCE_EXCEEDS_PAYMENTS', message: 'O repasse excede os pagamentos recebidos ainda não repassados.', statusCode: 409 });
      const remittance = await tx.commercialRemittance.create({ data: { publicId: randomUUID(), commercialAccountId: input.commercialAccountId, tenantId: input.tenantId, amountCents: input.amountCents, paymentMethod: input.paymentMethod, ...(input.proofReference === undefined ? {} : { proofReference: input.proofReference }) } });
      const allocations = [];
      let remaining = input.amountCents;
      for (const payment of payments) {
        if (remaining <= 0n) break;
        const existingForPayment = await tx.commercialRemittanceAllocation.aggregate({ where: { manualPaymentId: payment.id, remittance: { status: 'CONFIRMED' } }, _sum: { amountCents: true } });
        const available = payment.amountCents - (commissionByPayment.get(payment.publicId) ?? 0n) - (existingForPayment._sum.amountCents ?? 0n);
        const amount = available < remaining ? available : remaining;
        if (amount > 0n) { allocations.push(await tx.commercialRemittanceAllocation.create({ data: { remittanceId: remittance.id, manualPaymentId: payment.id, amountCents: amount } })); remaining -= amount; }
      }
      if (remaining !== 0n) throw new AppError({ code: 'COMMERCIAL_REMITTANCE_ALLOCATION_FAILED', message: 'Não foi possível alocar integralmente o repasse.', statusCode: 409 });
      return { publicId: remittance.publicId, status: remittance.status, amountCents: remittance.amountCents, allocations: allocations.map((a) => a.id) };
    });
  }

  async confirm(publicId: string, confirmedByUserId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const remittance = await tx.commercialRemittance.findUnique({ where: { publicId }, include: { allocations: true } });
      if (!remittance) throw new AppError({ code: 'COMMERCIAL_REMITTANCE_NOT_FOUND', message: 'Repasse não encontrado.', statusCode: 404 });
      if (remittance.status === 'CONFIRMED') return remittance;
      if (remittance.status !== 'PENDING') throw new AppError({ code: 'COMMERCIAL_REMITTANCE_NOT_PENDING', message: 'Repasse não está pendente.', statusCode: 409 });
      await tx.commercialRemittance.update({ where: { id: remittance.id }, data: { status: 'CONFIRMED', confirmedByUserId, confirmedAt: new Date() } });
      await tx.commercialWalletEntry.create({ data: { publicId: randomUUID(), commercialAccountId: remittance.commercialAccountId, type: 'ADJUSTMENT_CREDIT', amountCents: remittance.amountCents, tenantId: remittance.tenantId, remittanceId: remittance.id, description: `REPASSE_CONFIRMADO:${remittance.publicId}`, createdByUserId: confirmedByUserId } });
      return { publicId: remittance.publicId, status: 'CONFIRMED', amountCents: remittance.amountCents };
    });
  }
}
