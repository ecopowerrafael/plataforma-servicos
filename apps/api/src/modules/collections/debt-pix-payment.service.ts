import { randomUUID } from 'node:crypto';

import { formatMoneyCents, renderCollectionMessage } from './collection-attempt-templates.js';
import { type DebtService } from './debt.service.js';
import { type PaymentPromiseService } from './payment-promise.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { type NotificationService } from '../notifications/notification.service.js';
import { validatePaymentOrigin } from '../payments/payment-origin-validator.js';
import { type PaymentMethodService } from '../payments/payment-method.service.js';
import { type PaymentService } from '../payments/payment.service.js';

/**
 * Fase 6/7: materializa o pagamento PIX (integral ou parcial) de uma Debt
 * confirmado pelo gateway (webhook ou confirmação manual) — chamado por
 * PaymentGatewayService.reconcilePaidCharge quando a cobrança é originType
 * DEBT. Uma Debt tem duas origens possíveis e cada uma exige um tratamento
 * financeiro diferente:
 *
 * - Debt MANUAL (sem Agendamento por trás): não existe fluxo canônico pra
 *   reaproveitar. Cria um Payment isolado (originType DEBT) e o próprio Bot
 *   Cobra decrementa o saldo da Debt. O valor RECEBIDO fica todo registrado
 *   no Payment; o valor ALOCADO à Debt (o que reduz o saldo) é limitado ao
 *   saldo restante — o excedente (corrida entre duas cobranças pagas quase
 *   ao mesmo tempo) fica só rastreado (DEBT_PAYMENT_OVERFLOW), nunca gera
 *   saldo negativo nem reembolso automático.
 * - Debt de Agendamento (originAppointmentId presente): o saldo da Debt é só
 *   um espelho do saldo real do Agendamento — pagar precisa virar um Payment
 *   real de Agendamento via PaymentService.create() (que já cuida de caixa,
 *   comissão, loyalty e já chama syncAppointmentDebtBalance sozinho), nunca
 *   um Payment isolado. A proteção contra overpayment aqui é a validação que
 *   PaymentService.create() já tem — se ela rejeitar, a reconciliação lança
 *   (claim já feito, sem duplicar) em vez de inventar um workaround; fica
 *   como pendência para tratamento manual, documentado e testado.
 *
 * Em ambos os casos, um DebtPaymentAllocation (source BOT_PIX) é criado como
 * registro de rastreabilidade — nunca é a fonte da verdade do saldo. Uma
 * PaymentPromise ACTIVE nunca é apagada por um pagamento parcial; só vira
 * FULFILLED quando o saldo realmente zera.
 */
export class DebtPixPaymentService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly debts: DebtService,
    private readonly notifications: NotificationService,
    private readonly paymentMethods: PaymentMethodService,
    private readonly payments: PaymentService,
    private readonly paymentPromises: PaymentPromiseService,
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
    let allocatedAmountCents: bigint;
    let remainingBalanceCents: bigint;

    if (debt.originType === 'MANUAL') {
      const result = await this.client.$transaction(async (tx) => {
        const methodRow = await tx.paymentMethod.findFirst({
          where: { tenantId: charge.tenantId, publicId: method.publicId },
          select: { id: true },
        });
        if (methodRow === null) throw new Error('Forma de pagamento sintética não encontrada.');

        const receivedAmount = charge.amountCents;
        const allocated = receivedAmount < debt.currentBalanceCents ? receivedAmount : debt.currentBalanceCents;
        const overflow = receivedAmount - allocated;

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
            // O Payment registra o valor REALMENTE recebido — nunca clampado.
            amountCents: receivedAmount,
            notes: `Pago via gateway ${charge.provider}${charge.externalId === null ? '' : ` (${charge.externalId})`}.`,
          },
        });
        await tx.debtPaymentAllocation.create({
          data: {
            publicId: randomUUID(),
            tenantId: charge.tenantId,
            debtId: debt.id,
            paymentId: payment.id,
            // A alocação à Debt é limitada ao saldo restante — nunca deixa o saldo negativo.
            amountCents: allocated,
            source: 'BOT_PIX',
          },
        });

        const newBalance = debt.currentBalanceCents - allocated; // sempre >= 0 por construção
        await tx.debt.update({
          where: { id: debt.id },
          data: { currentBalanceCents: newBalance, ...(newBalance === 0n ? { status: 'PAID', paidAt: now } : {}) },
        });

        await this.debts.recordEvent(
          charge.tenantId,
          debt.id,
          'PARTIAL_PAYMENT_RECEIVED',
          {
            paymentPublicId: payment.publicId,
            amountCents: allocated.toString(),
            previousBalanceCents: debt.currentBalanceCents.toString(),
            currentBalanceCents: newBalance.toString(),
            source: 'BOT_PIX',
          },
          tx,
        );
        if (overflow > 0n) {
          await this.debts.recordEvent(
            charge.tenantId,
            debt.id,
            'DEBT_PAYMENT_OVERFLOW',
            {
              paymentAmountCents: receivedAmount.toString(),
              allocatedAmountCents: allocated.toString(),
              overflowCents: overflow.toString(),
            },
            tx,
          );
        }

        if (newBalance === 0n) {
          await this.debts.recordEvent(charge.tenantId, debt.id, 'DEBT_PAID', {
            source: 'BOT_PIX',
            paymentPublicId: payment.publicId,
          }, tx);
          await this.paymentPromises.fulfillActive(charge.tenantId, debt.id, tx);
          await tx.collectionAttempt.updateMany({
            where: { tenantId: charge.tenantId, debtId: debt.id, status: 'SCHEDULED' },
            data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
          });
        } else {
          // Régua normal (cycleNumber != 0) precisa recalcular com o saldo novo;
          // tentativas de promessa (cycleNumber 0) não são tocadas.
          await tx.collectionAttempt.updateMany({
            where: { tenantId: charge.tenantId, debtId: debt.id, status: 'SCHEDULED', cycleNumber: { not: 0 } },
            data: { status: 'CANCELED', skippedAt: now, skipReason: 'BALANCE_CHANGED' },
          });
        }

        await tx.paymentGatewayCharge.update({ where: { id: charge.id }, data: { paymentId: payment.id } });
        return { settled: newBalance === 0n, allocated, newBalance };
      });
      settled = result.settled;
      allocatedAmountCents = result.allocated;
      remainingBalanceCents = result.newBalance;
    } else {
      // Debt de Agendamento: nunca cria Payment isolado — reaproveita o fluxo
      // canônico. A cobrança já está PAID neste ponto (handleWebhook/
      // confirmManualCharge atualizam o status antes de reconciliar), então
      // ela nunca se autobloqueia na checagem de "cobrança de gateway
      // pendente" do PaymentService.create(); se existir OUTRA cobrança
      // pendente pro mesmo Agendamento, o bloqueio é correto e continua
      // valendo. Overpayment: se o valor recebido ultrapassar o saldo do
      // Agendamento, PaymentService.create() rejeita (PAYMENT_EXCEEDS_
      // APPOINTMENT_PRICE) — deixamos propagar. O claim já feito acima evita
      // reprocessar a mesma cobrança; a pendência fica visível para
      // tratamento manual, sem workaround silencioso.
      if (debt.originAppointmentId === null) return;
      const appointment = await this.client.appointment.findUnique({
        where: { id: debt.originAppointmentId },
        select: { publicId: true },
      });
      if (appointment === null) return;

      const previousBalance = debt.currentBalanceCents;
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
        select: { status: true, currentBalanceCents: true },
      });
      settled = refreshedDebt?.status === 'PAID';
      remainingBalanceCents = refreshedDebt?.currentBalanceCents ?? previousBalance;
      allocatedAmountCents = charge.amountCents;

      await this.debts.recordEvent(charge.tenantId, debt.id, 'PARTIAL_PAYMENT_RECEIVED', {
        paymentPublicId: payment.publicId,
        amountCents: allocatedAmountCents.toString(),
        previousBalanceCents: previousBalance.toString(),
        currentBalanceCents: remainingBalanceCents.toString(),
        source: 'BOT_PIX',
      });

      if (settled) {
        await this.paymentPromises.fulfillActive(charge.tenantId, debt.id);
        await this.client.collectionAttempt.updateMany({
          where: { tenantId: charge.tenantId, debtId: debt.id, status: 'SCHEDULED' },
          data: { status: 'CANCELED', skippedAt: now, skipReason: 'DEBT_PAID' },
        });
      } else {
        await this.client.collectionAttempt.updateMany({
          where: { tenantId: charge.tenantId, debtId: debt.id, status: 'SCHEDULED', cycleNumber: { not: 0 } },
          data: { status: 'CANCELED', skippedAt: now, skipReason: 'BALANCE_CHANGED' },
        });
      }
    }

    await this.sendPaymentConfirmation(
      charge.tenantId,
      debt.debtorWhatsapp,
      debt.debtorName,
      debt.tenant.displayName,
      settled,
      allocatedAmountCents,
      remainingBalanceCents,
    );
  }

  /** Melhor esforço — não deve desfazer o pagamento (já commitado) se o envio falhar. */
  private async sendPaymentConfirmation(
    tenantId: bigint,
    debtorWhatsapp: string,
    debtorName: string,
    tenantName: string,
    settled: boolean,
    amountCents: bigint,
    remainingBalanceCents: bigint,
  ): Promise<void> {
    const phone = normalizeWhatsAppPhone(debtorWhatsapp);
    if (phone === null) return;

    const kind = settled ? 'collection.debt_settled' : 'collection.partial_received';
    const body = settled
      ? renderCollectionMessage('collection.debt_settled', { debtorName, tenantName })
      : renderCollectionMessage('collection.partial_received', {
          debtorName,
          tenantName,
          amount: formatMoneyCents(amountCents),
          remainingAmount: formatMoneyCents(remainingBalanceCents),
        });
    if (body === null) return;

    try {
      const targetPublicId = randomUUID();
      await this.notifications.enqueue(tenantId, {
        channel: 'WHATSAPP',
        kind,
        targetType: 'collection_reply',
        targetPublicId,
        recipient: phone,
        subject: 'Cobrança em aberto',
        body,
        whatsappButtons: [],
      });
      const log = await this.client.notificationLog.findFirst({
        where: { tenantId, kind, targetType: 'collection_reply', targetPublicId, channel: 'WHATSAPP', recipient: phone },
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
