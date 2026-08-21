import { randomUUID } from 'node:crypto';

import { renderCollectionMessage } from './collection-attempt-templates.js';
import { type DebtService } from './debt.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { type NotificationService } from '../notifications/notification.service.js';
import { validatePaymentOrigin } from '../payments/payment-origin-validator.js';
import { type PaymentMethodService } from '../payments/payment-method.service.js';
import { type PaymentService } from '../payments/payment.service.js';

/**
 * Fase 6: materializa o pagamento PIX de uma Debt confirmado pelo gateway
 * (webhook ou confirmação manual) — chamado por
 * PaymentGatewayService.reconcilePaidCharge quando a cobrança é originType
 * DEBT. Uma Debt tem duas origens possíveis e cada uma exige um tratamento
 * financeiro diferente:
 *
 * - Debt MANUAL (sem Agendamento por trás): não existe fluxo canônico pra
 *   reaproveitar. Cria um Payment isolado (originType DEBT) e o próprio Bot
 *   Cobra decrementa o saldo da Debt.
 * - Debt de Agendamento (originAppointmentId presente): o saldo da Debt é só
 *   um espelho do saldo real do Agendamento — pagar precisa virar um Payment
 *   real de Agendamento via PaymentService.create() (que já cuida de caixa,
 *   comissão, loyalty e já chama syncAppointmentDebtBalance sozinho), nunca
 *   um Payment isolado, senão o saldo do Agendamento e o saldo da Debt
 *   divergem — exatamente o problema que a sincronização das Fases 0-5 evita.
 *
 * Em ambos os casos, um DebtPaymentAllocation (source BOT_PIX) é criado como
 * registro de rastreabilidade — nunca é a fonte da verdade do saldo.
 */
export class DebtPixPaymentService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly debts: DebtService,
    private readonly notifications: NotificationService,
    private readonly paymentMethods: PaymentMethodService,
    private readonly payments: PaymentService,
  ) {}

  public async reconcile(chargeId: bigint, now: Date = new Date()): Promise<void> {
    // Claim atômico: evita que dois webhooks quase simultâneos (externalEventId
    // diferentes, mesma cobrança) processem a mesma cobrança duas vezes antes de
    // qualquer um preencher paymentId.
    const claimed = await this.client.paymentGatewayCharge.updateMany({
      where: { id: chargeId, originType: 'DEBT', paymentId: null, reconciledAt: null },
      data: { reconciledAt: now },
    });
    if (claimed.count !== 1) return;

    const charge = await this.client.paymentGatewayCharge.findUnique({ where: { id: chargeId } });
    if (charge === null || charge.debtId === null) return;

    const debt = await this.client.debt.findUnique({
      where: { id: charge.debtId },
      select: {
        id: true,
        tenantId: true,
        originType: true,
        originAppointmentId: true,
        currentBalanceCents: true,
        debtorName: true,
        debtorWhatsapp: true,
        tenant: { select: { displayName: true, timezone: true } },
      },
    });
    if (debt === null) return;

    const methodName = `Gateway (${charge.provider})`;
    const methods = await this.paymentMethods.list(charge.tenantId);
    let method = methods.items.find((item) => item.name === methodName);
    method ??= await this.paymentMethods.create(charge.tenantId, {
      name: methodName,
      type: 'OTHER',
      sortOrder: 999,
      active: true,
    });

    let settled: boolean;

    if (debt.originType === 'MANUAL') {
      const result = await this.client.$transaction(async (tx) => {
        const methodRow = await tx.paymentMethod.findFirst({
          where: { tenantId: charge.tenantId, publicId: method.publicId },
          select: { id: true },
        });
        if (methodRow === null) throw new Error('Forma de pagamento sintética não encontrada.');

        validatePaymentOrigin('DEBT', null, null, debt.id);
        const payment = await tx.payment.create({
          data: {
            publicId: randomUUID(),
            tenantId: charge.tenantId,
            originType: 'DEBT',
            debtId: debt.id,
            paymentMethodId: methodRow.id,
            kind: charge.kind,
            status: 'PAID',
            amountCents: charge.amountCents,
            notes: `Pago via gateway ${charge.provider}${charge.externalId === null ? '' : ` (${charge.externalId})`}.`,
          },
        });
        await tx.debtPaymentAllocation.create({
          data: {
            publicId: randomUUID(),
            tenantId: charge.tenantId,
            debtId: debt.id,
            paymentId: payment.id,
            amountCents: charge.amountCents,
            source: 'BOT_PIX',
          },
        });

        const remaining = debt.currentBalanceCents - charge.amountCents;
        const clamped = remaining < 0n ? 0n : remaining;
        await tx.debt.update({
          where: { id: debt.id },
          data: { currentBalanceCents: clamped, ...(clamped === 0n ? { status: 'PAID', paidAt: now } : {}) },
        });
        if (clamped === 0n) {
          await this.debts.recordEvent(
            charge.tenantId,
            debt.id,
            'DEBT_PAID',
            { source: 'BOT_PIX', paymentPublicId: payment.publicId },
            tx,
          );
          await tx.collectionAttempt.updateMany({
            where: { tenantId: charge.tenantId, debtId: debt.id, status: 'SCHEDULED' },
            data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
          });
        }

        await tx.paymentGatewayCharge.update({ where: { id: charge.id }, data: { paymentId: payment.id } });
        return { settled: clamped === 0n };
      });
      settled = result.settled;
    } else {
      // Debt de Agendamento: nunca cria Payment isolado — reaproveita o fluxo
      // canônico. A cobrança já está PAID neste ponto (handleWebhook/
      // confirmManualCharge atualizam o status antes de reconciliar), então
      // ela nunca se autobloqueia na checagem de "cobrança de gateway
      // pendente" do PaymentService.create(); se existir OUTRA cobrança
      // pendente pro mesmo Agendamento, o bloqueio é correto e continua valendo.
      if (debt.originAppointmentId === null) return;
      const appointment = await this.client.appointment.findUnique({
        where: { id: debt.originAppointmentId },
        select: { publicId: true },
      });
      if (appointment === null) return;

      const payment = await this.payments.create(
        charge.tenantId,
        appointment.publicId,
        {
          paymentMethodPublicId: method.publicId,
          kind: charge.kind,
          amountCents: Number(charge.amountCents),
          notes: `Pago via gateway ${charge.provider}${charge.externalId === null ? '' : ` (${charge.externalId})`}.`,
        },
        { userId: null, sessionId: null },
      );

      const paymentRecord = await this.client.payment.findFirst({
        where: { tenantId: charge.tenantId, publicId: payment.publicId },
        select: { id: true },
      });
      if (paymentRecord === null) return;

      await this.client.debtPaymentAllocation.create({
        data: {
          publicId: randomUUID(),
          tenantId: charge.tenantId,
          debtId: debt.id,
          paymentId: paymentRecord.id,
          amountCents: charge.amountCents,
          source: 'BOT_PIX',
        },
      });
      await this.client.paymentGatewayCharge.update({
        where: { id: charge.id },
        data: { paymentId: paymentRecord.id },
      });

      const refreshedDebt = await this.client.debt.findUnique({
        where: { id: debt.id },
        select: { status: true },
      });
      settled = refreshedDebt?.status === 'PAID';
      if (settled) {
        await this.client.collectionAttempt.updateMany({
          where: { tenantId: charge.tenantId, debtId: debt.id, status: 'SCHEDULED' },
          data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
        });
      }
    }

    if (!settled) return;
    await this.sendSettlementMessage(charge.tenantId, debt.debtorWhatsapp, debt.debtorName, debt.tenant.displayName);
  }

  /** Melhor esforço — não deve desfazer o pagamento (já commitado) se o envio falhar. */
  private async sendSettlementMessage(
    tenantId: bigint,
    debtorWhatsapp: string,
    debtorName: string,
    tenantName: string,
  ): Promise<void> {
    const phone = normalizeWhatsAppPhone(debtorWhatsapp);
    if (phone === null) return;
    const body = renderCollectionMessage('collection.debt_settled', { debtorName, tenantName });
    if (body === null) return;

    try {
      const targetPublicId = randomUUID();
      await this.notifications.enqueue(tenantId, {
        channel: 'WHATSAPP',
        kind: 'collection.debt_settled',
        targetType: 'collection_reply',
        targetPublicId,
        recipient: phone,
        subject: 'Cobrança em aberto',
        body,
        whatsappButtons: [],
      });
      const log = await this.client.notificationLog.findFirst({
        where: {
          tenantId,
          kind: 'collection.debt_settled',
          targetType: 'collection_reply',
          targetPublicId,
          channel: 'WHATSAPP',
          recipient: phone,
        },
      });
      if (log === null) return;
      try {
        await this.notifications.retry(tenantId, log.publicId);
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'NOTIFICATION_ALREADY_SENT') throw error;
      }
    } catch {
      // Melhor esforço — o pagamento já está registrado independente do envio.
    }
  }
}
