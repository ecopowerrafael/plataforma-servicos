import { COLLECTION_ACTIONS, isCollectionAction } from './collection-actions.js';
import { formatDueDate, formatMoneyCents, renderCollectionMessage } from './collection-attempt-templates.js';
import { type DebtService } from './debt.service.js';
import { calculatePartialPaymentCents, MIN_PARTIAL_PAYMENT_CENTS } from './partial-payment.js';
import { type PaymentPromiseService } from './payment-promise.service.js';
import { type NotificationLog, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { type NotificationService } from '../notifications/notification.service.js';
import { type PaymentGatewayService } from '../payments/gateway/payment-gateway.service.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';
import { addDaysToDay, resolveTimezone, zonedDayKey } from '../tenants/timezone.js';

const COLLECTION_BUTTONS = [
  { actionKey: 'COLLECTION_PAY_FULL', label: 'Pagar valor total', enabled: true, order: 0 },
  { actionKey: 'COLLECTION_PAY_PARTIAL', label: 'Pagar uma parte agora', enabled: true, order: 1 },
  { actionKey: 'COLLECTION_NEED_MORE_TIME', label: 'Preciso de mais prazo', enabled: true, order: 2 },
  { actionKey: 'COLLECTION_HUMAN_SUPPORT', label: 'Falar com atendimento', enabled: true, order: 3 },
];

const PROMISE_DAYS_BY_ACTION: Record<string, number> = {
  COLLECTION_PROMISE_1D: 1,
  COLLECTION_PROMISE_3D: 3,
  COLLECTION_PROMISE_7D: 7,
  COLLECTION_PROMISE_10D: 10,
};

/** Percentuais fixos de entrada (Fase 7) — sem texto livre nesta fase. */
const PARTIAL_PERCENTAGE_BY_ACTION: Record<string, number> = {
  COLLECTION_PARTIAL_20: 20,
  COLLECTION_PARTIAL_30: 30,
  COLLECTION_PARTIAL_50: 50,
};

const actionLabel = (actionId: string): string =>
  COLLECTION_ACTIONS.find((action) => action.actionId === actionId)?.label ?? actionId;

const optionButtons = (actionIds: string[]) =>
  actionIds.map((actionKey, order) => ({ actionKey, label: actionLabel(actionKey), enabled: true, order }));

/** As 4 opções de prazo cabem numa única mensagem (mensagens com 5 botões já funcionam em produção). */
const PROMISE_OPTION_BUTTONS = optionButtons(Object.keys(PROMISE_DAYS_BY_ACTION));

/** 20% / 30% / 50% + pagar tudo + mais prazo — 5 botões, mesmo limite já validado na Fase 5. */
const PARTIAL_OPTION_BUTTONS = optionButtons([
  ...Object.keys(PARTIAL_PERCENTAGE_BY_ACTION),
  'COLLECTION_PAY_FULL',
  'COLLECTION_NEED_MORE_TIME',
]);

const MAX_TECHNICAL_RETRIES = 3;

/** Backoff simples: n minutos × 2^n, capado pelo teto de tentativas técnicas. */
function technicalBackoffMs(retryCount: number): number {
  return retryCount * 2 ** retryCount * 60_000;
}

type DebtForSend = {
  id: bigint;
  tenantId: bigint;
  status: string;
  currentBalanceCents: bigint;
  balanceSyncPending: boolean;
  debtorName: string;
  debtorWhatsapp: string;
  dueDate: Date;
  tenant: { displayName: string; timezone: string };
};

/**
 * Retorna o motivo do bloqueio, ou null se a Debt pode receber cobrança agora.
 * PROMISE_DUE é a única exceção ao "status precisa ser OPEN": é exatamente o
 * lembrete da promessa que pausou a régua (Debt em PROMISE_SCHEDULED).
 */
function debtBlockReason(debt: DebtForSend, attemptType: string): string | null {
  const isPromiseDueException = attemptType === 'PROMISE_DUE' && debt.status === 'PROMISE_SCHEDULED';
  if (!isPromiseDueException) {
    if (debt.status === 'PAUSED') return 'DEBT_PAUSED';
    if (debt.status === 'HUMAN_SUPPORT') return 'DEBT_HUMAN_SUPPORT';
    if (debt.status === 'DISPUTED') return 'DEBT_DISPUTED';
    if (debt.status === 'PAID') return 'DEBT_PAID';
    if (debt.status === 'CANCELED') return 'DEBT_CANCELED';
    if (debt.status !== 'OPEN') return 'DEBT_STATUS_NOT_COLLECTIBLE';
  }
  if (debt.currentBalanceCents <= 0n) return 'DEBT_BALANCE_ZERO';
  if (debt.balanceSyncPending) return 'DEBT_BALANCE_SYNC_PENDING';
  return null;
}

/**
 * Fase 4: executa CollectionAttempt já agendados (Fase 3) via WhatsApp,
 * reaproveitando o envio outbound existente (NotificationService) — nunca
 * cria um provider novo. Também processa a resposta estruturada do devedor
 * (clique em botão) roteada pelo IntegrationService.
 */
export class CollectionAttemptExecutionService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly debts: DebtService,
    private readonly paymentPromises: PaymentPromiseService,
    private readonly paymentGateway?: PaymentGatewayService,
  ) {}

  public async run(
    now: Date = new Date(),
  ): Promise<{ sent: number; canceled: number; failed: number; retried: number }> {
    const due = await this.client.collectionAttempt.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
        OR: [{ technicalRetryCount: 0 }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { id: 'asc' },
    });

    let sent = 0;
    let canceled = 0;
    let failed = 0;
    let retried = 0;

    for (const attempt of due) {
      const claimed = await this.client.collectionAttempt.updateMany({
        where: { id: attempt.id, status: 'SCHEDULED' },
        data: { status: 'PROCESSING', processingAt: now },
      });
      if (claimed.count !== 1) continue;

      try {
        const outcome = await this.processClaimedAttempt(attempt, now);
        if (outcome === 'sent') sent += 1;
        else if (outcome === 'canceled') canceled += 1;
        else if (outcome === 'failed') failed += 1;
        else retried += 1;
      } catch (error) {
        // Erro inesperado (fora do fluxo de envio já tratado): conta como
        // falha técnica, para não deixar a linha presa em PROCESSING nem
        // derrubar o worker.
        const retriedAgain = await this.registerTechnicalFailure(
          attempt.id,
          attempt.technicalRetryCount,
          now,
          error instanceof Error ? error.message.slice(0, 500) : 'Erro desconhecido.',
        );
        if (retriedAgain) retried += 1;
        else failed += 1;
      }
    }

    return { sent, canceled, failed, retried };
  }

  private async processClaimedAttempt(
    attempt: {
      id: bigint;
      publicId: string;
      debtId: bigint;
      tenantId: bigint;
      templateKey: string;
      attemptType: string;
      technicalRetryCount: number;
    },
    now: Date,
  ): Promise<'sent' | 'canceled' | 'failed' | 'retried'> {
    const debt = await this.client.debt.findUnique({
      where: { id: attempt.debtId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        currentBalanceCents: true,
        balanceSyncPending: true,
        debtorName: true,
        debtorWhatsapp: true,
        dueDate: true,
        tenant: { select: { displayName: true, timezone: true } },
      },
    });
    if (debt === null) return 'failed';

    const blockReason = debtBlockReason(debt, attempt.attemptType);
    if (blockReason !== null) {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: { status: 'CANCELED', skippedAt: now, skipReason: blockReason },
      });
      return 'canceled';
    }

    if (!(await this.isWhatsAppReady(debt.tenantId))) {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', lastError: 'WHATSAPP_NOT_CONFIGURED' },
      });
      return 'failed';
    }

    const phone = normalizeWhatsAppPhone(debt.debtorWhatsapp);
    if (phone === null) {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', lastError: 'INVALID_DEBTOR_WHATSAPP' },
      });
      return 'failed';
    }

    const timezone = resolveTimezone(debt.tenant.timezone);
    const body = renderCollectionMessage(attempt.templateKey, {
      debtorName: debt.debtorName,
      tenantName: debt.tenant.displayName,
      amount: formatMoneyCents(debt.currentBalanceCents),
      dueDate: formatDueDate(debt.dueDate, timezone),
    });
    if (body === null) {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', lastError: 'TEMPLATE_NOT_FOUND' },
      });
      return 'failed';
    }

    const { log: refreshed, outbound } = await this.sendWhatsApp(
      debt.tenantId,
      phone,
      body,
      COLLECTION_BUTTONS,
      attempt.templateKey,
      'collection_attempt',
      attempt.publicId,
      now,
    );

    if (refreshed.status === 'SENT') {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SENT',
          sentAt: refreshed.sentAt ?? now,
          notificationLogId: refreshed.id,
          providerMessageId: outbound?.externalMessageId ?? null,
        },
      });
      await this.debts.recordEvent(debt.tenantId, debt.id, 'COLLECTION_ATTEMPT_SENT', {
        collectionAttemptPublicId: attempt.publicId,
        templateKey: attempt.templateKey,
      });
      return 'sent';
    }

    if (refreshed.status === 'SKIPPED') {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', lastError: 'WHATSAPP_NOT_CONFIGURED', notificationLogId: refreshed.id },
      });
      return 'failed';
    }

    // FAILED: erro transitório do provider — retry técnico, não avança o ciclo.
    const retried = await this.registerTechnicalFailure(
      attempt.id,
      attempt.technicalRetryCount,
      now,
      refreshed.lastError,
      refreshed.id,
    );
    if (retried) return 'retried';

    await this.debts.recordEvent(debt.tenantId, debt.id, 'COLLECTION_ATTEMPT_FAILED', {
      collectionAttemptPublicId: attempt.publicId,
      templateKey: attempt.templateKey,
    });
    return 'failed';
  }

  /**
   * Envio compartilhado: cria/reaproveita o NotificationLog (idempotente,
   * mesma identidade tupla do NotificationService) e dispara na hora via
   * retry() — usado tanto pelas tentativas agendadas quanto pelas respostas
   * imediatas de conversa (confirmação de promessa, menu de prazo).
   */
  private async sendWhatsApp(
    tenantId: bigint,
    phone: string,
    body: string,
    buttons: Array<{ actionKey: string; label: string; enabled: boolean; order: number }>,
    kind: string,
    targetType: string,
    targetPublicId: string,
    now: Date,
  ): Promise<{ log: NotificationLog; outbound: { externalMessageId: string | null } | null }> {
    await this.notifications.enqueue(
      tenantId,
      {
        channel: 'WHATSAPP',
        kind,
        targetType,
        targetPublicId,
        recipient: phone,
        subject: 'Cobrança em aberto',
        body,
        whatsappButtons: buttons,
      },
      now,
    );

    const log = await this.client.notificationLog.findFirst({
      where: { tenantId, kind, targetType, targetPublicId, channel: 'WHATSAPP', recipient: phone },
    });
    if (log === null) throw new Error('NotificationLog não encontrado após enqueue.');

    try {
      await this.notifications.retry(tenantId, log.publicId);
    } catch (error) {
      // Já foi enviado numa rodada anterior que caiu antes de refletir aqui —
      // idempotência: segue como sucesso, sem reenviar.
      if (!(error instanceof AppError) || error.code !== 'NOTIFICATION_ALREADY_SENT') throw error;
    }

    const refreshed = await this.client.notificationLog.findUniqueOrThrow({ where: { id: log.id } });
    const outbound = await this.client.whatsAppOutboundMessage.findFirst({
      where: { notificationLogId: log.id },
      orderBy: { id: 'desc' },
    });
    return { log: refreshed, outbound };
  }

  /** Resposta imediata de conversa (não é uma CollectionAttempt agendada) — melhor esforço. */
  private async sendImmediateReply(
    tenantId: bigint,
    debtId: bigint,
    phone: string,
    body: string,
    buttons: Array<{ actionKey: string; label: string; enabled: boolean; order: number }>,
    kind: string,
    now: Date,
  ): Promise<void> {
    // Recuperar debtPublicId para roteamento correto em resolveActionId.
    const debt = await this.client.debt.findUnique({
      where: { id: debtId },
      select: { publicId: true },
    });
    if (debt === null) return;
    await this.sendWhatsApp(tenantId, phone, body, buttons, kind, 'collection_reply', debt.publicId, now);
  }

  /** Aplica o backoff técnico; retorna true se reagendou (SCHEDULED), false se esgotou (FAILED terminal). */
  private async registerTechnicalFailure(
    attemptId: bigint,
    currentRetryCount: number,
    now: Date,
    lastError: string | null,
    notificationLogId?: bigint,
  ): Promise<boolean> {
    const retryCount = currentRetryCount + 1;
    if (retryCount >= MAX_TECHNICAL_RETRIES) {
      await this.client.collectionAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'FAILED',
          technicalRetryCount: retryCount,
          lastError,
          ...(notificationLogId === undefined ? {} : { notificationLogId }),
        },
      });
      return false;
    }

    await this.client.collectionAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SCHEDULED',
        technicalRetryCount: retryCount,
        nextRetryAt: new Date(now.getTime() + technicalBackoffMs(retryCount)),
        lastError,
        ...(notificationLogId === undefined ? {} : { notificationLogId }),
      },
    });
    return true;
  }

  private async isWhatsAppReady(tenantId: bigint): Promise<boolean> {
    const entitled = await new PlanEntitlementService().featureEnabledForTenant(
      this.client,
      tenantId,
      'whatsapp.enabled',
    );
    if (!entitled) return false;
    const config = await this.client.tenantWhatsAppConfig.findUnique({
      where: { tenantId },
      select: { active: true },
    });
    return config?.active === true;
  }

  /**
   * Resposta estruturada do devedor (clique em botão), roteada pelo
   * IntegrationService a partir do targetType='collection_attempt' resolvido
   * no próprio backend — nunca de um id vindo do payload do webhook.
   */
  public async handleWhatsAppResponse(
    tenantId: bigint,
    collectionAttemptPublicId: string,
    actionId: string | null,
    now: Date = new Date(),
  ): Promise<{ handled: boolean }> {
    if (actionId === null || !isCollectionAction(actionId)) return { handled: false };

    const attempt = await this.client.collectionAttempt.findFirst({
      where: { tenantId, publicId: collectionAttemptPublicId },
      select: { id: true, debtId: true, status: true },
    });
    if (attempt === null) return { handled: false };

    if (attempt.status === 'SENT') {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: { status: 'RESPONDED', respondedAt: now },
      });
    }
    await this.debts.recordEvent(tenantId, attempt.debtId, 'COLLECTION_RESPONSE_RECEIVED', { actionId });

    if (actionId === 'COLLECTION_HUMAN_SUPPORT') {
      await this.debts.markHumanSupport(tenantId, attempt.debtId);
      await this.cancelScheduledAttempts(tenantId, attempt.debtId, 'HUMAN_SUPPORT_REQUESTED', now);
      return { handled: true };
    }

    if (actionId === 'COLLECTION_DISPUTE') {
      await this.debts.markDisputed(tenantId, attempt.debtId);
      await this.cancelScheduledAttempts(tenantId, attempt.debtId, 'DEBT_DISPUTED', now);
      return { handled: true };
    }

    const promiseDays = PROMISE_DAYS_BY_ACTION[actionId];
    if (promiseDays !== undefined) {
      await this.createPromiseAndConfirm(tenantId, attempt.debtId, promiseDays, now);
      return { handled: true };
    }

    if (actionId === 'COLLECTION_NEED_MORE_TIME') {
      await this.offerPromiseOptions(tenantId, attempt.debtId, now);
      return { handled: true };
    }

    if (actionId === 'COLLECTION_PAY_FULL') {
      await this.sendPixCharge(tenantId, attempt.debtId, now);
      return { handled: true };
    }

    if (actionId === 'COLLECTION_PAY_PARTIAL') {
      await this.offerPartialOptions(tenantId, attempt.debtId, now);
      return { handled: true };
    }

    const partialPercentage = PARTIAL_PERCENTAGE_BY_ACTION[actionId];
    if (partialPercentage !== undefined) {
      await this.sendPartialPixCharge(tenantId, attempt.debtId, partialPercentage, now);
      return { handled: true };
    }

    if (actionId === 'COLLECTION_PAYMENT_STATUS') {
      await this.sendPaymentStatus(tenantId, attempt.debtId, now);
      return { handled: true };
    }

    // COLLECTION_PROMISE_CUSTOM_DATE: depende de texto livre, fora do escopo — só o ack genérico acima.
    return { handled: true };
  }

  private async cancelScheduledAttempts(tenantId: bigint, debtId: bigint, skipReason: string, now: Date): Promise<void> {
    await this.client.collectionAttempt.updateMany({
      where: { tenantId, debtId, status: 'SCHEDULED' },
      data: { status: 'CANCELED', skippedAt: now, skipReason },
    });
  }

  /** Cria/substitui a promessa (Fase 5) e confirma por WhatsApp — melhor esforço na confirmação. */
  private async createPromiseAndConfirm(tenantId: bigint, debtId: bigint, days: number, now: Date): Promise<void> {
    const debt = await this.client.debt.findUnique({
      where: { id: debtId },
      select: { debtorWhatsapp: true, tenant: { select: { timezone: true } } },
    });
    if (debt === null) return;

    const timezone = resolveTimezone(debt.tenant.timezone);
    const promisedDayKey = addDaysToDay(zonedDayKey(now, timezone), days);
    const promisedDate = new Date(`${promisedDayKey}T00:00:00.000Z`);

    await this.paymentPromises.createOrReplace(tenantId, debtId, promisedDate, 'WHATSAPP');

    const phone = normalizeWhatsAppPhone(debt.debtorWhatsapp);
    if (phone === null) return;
    const body = renderCollectionMessage('collection.promise_confirmation', {
      dueDate: formatDueDate(promisedDate, timezone),
    });
    if (body === null) return;
    try {
      await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.promise_confirmation', now);
    } catch {
      // A promessa já foi criada e vale mesmo se a confirmação falhar ao enviar.
    }
  }

  /** Oferece as 4 opções de prazo — melhor esforço, não muda nenhum estado. */
  private async offerPromiseOptions(tenantId: bigint, debtId: bigint, now: Date): Promise<void> {
    const debt = await this.client.debt.findUnique({
      where: { id: debtId },
      select: { debtorName: true, debtorWhatsapp: true },
    });
    if (debt === null) return;
    const phone = normalizeWhatsAppPhone(debt.debtorWhatsapp);
    if (phone === null) return;

    const body = renderCollectionMessage('collection.need_more_time_options', { debtorName: debt.debtorName });
    if (body === null) return;
    try {
      await this.sendImmediateReply(tenantId, debtId, phone, body, PROMISE_OPTION_BUTTONS, 'collection.need_more_time_options', now);
    } catch {
      // Melhor esforço — o devedor pode tentar de novo clicando "preciso de mais prazo".
    }
  }

  /** Gera (ou reaproveita) o PIX integral (Fase 6) e envia — melhor esforço, não muda nenhum estado por si só. */
  private async sendPixCharge(tenantId: bigint, debtId: bigint, now: Date): Promise<void> {
    const debt = await this.client.debt.findUnique({
      where: { id: debtId },
      select: { debtorName: true, debtorWhatsapp: true, currentBalanceCents: true, tenant: { select: { displayName: true } } },
    });
    if (debt === null) return;
    const phone = normalizeWhatsAppPhone(debt.debtorWhatsapp);
    if (phone === null) return;

    if (debt.currentBalanceCents <= 0n) {
      const body = renderCollectionMessage('collection.debt_already_settled', {
        debtorName: debt.debtorName,
        tenantName: debt.tenant.displayName,
      });
      if (body === null) return;
      try {
        await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.debt_already_settled', now);
      } catch {
        // Melhor esforço.
      }
      return;
    }

    const charge = await this.paymentGateway?.createDebtCharge(tenantId, debtId);
    if (charge === undefined || charge === null || charge.pixCopyPaste === null) {
      const body = renderCollectionMessage('collection.pix_unavailable', {});
      if (body === null) return;
      try {
        await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.pix_unavailable', now);
      } catch {
        // Melhor esforço.
      }
      return;
    }

    const body = renderCollectionMessage('collection.pix_charge', {
      amount: formatMoneyCents(debt.currentBalanceCents),
      tenantName: debt.tenant.displayName,
      pixCode: charge.pixCopyPaste,
    });
    if (body === null) return;
    try {
      await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.pix_charge', now);
    } catch {
      // Melhor esforço — a cobrança já foi criada e continua válida mesmo se o envio falhar.
    }
  }

  /** Oferece as opções de entrada (20/30/50%) — melhor esforço, não muda nenhum estado. */
  private async offerPartialOptions(tenantId: bigint, debtId: bigint, now: Date): Promise<void> {
    const debt = await this.client.debt.findUnique({ where: { id: debtId }, select: { debtorWhatsapp: true } });
    if (debt === null) return;
    const phone = normalizeWhatsAppPhone(debt.debtorWhatsapp);
    if (phone === null) return;

    const body = renderCollectionMessage('collection.partial_options', {});
    if (body === null) return;
    try {
      await this.sendImmediateReply(tenantId, debtId, phone, body, PARTIAL_OPTION_BUTTONS, 'collection.partial_options', now);
    } catch {
      // Melhor esforço — o devedor pode tentar de novo clicando "pagar uma parte agora".
    }
  }

  /**
   * Gera (ou reaproveita) o PIX parcial — nunca reduz saldo por si só (isso só
   * acontece na confirmação, via DebtPixPaymentService.reconcile). Abaixo do
   * mínimo (seja porque o saldo já é pequeno, seja porque o percentual
   * calculou um valor baixo demais), oferece o pagamento integral em vez de
   * gerar um PIX parcial que não vale a pena.
   */
  private async sendPartialPixCharge(tenantId: bigint, debtId: bigint, percentage: number, now: Date): Promise<void> {
    const debt = await this.client.debt.findUnique({
      where: { id: debtId },
      select: { debtorWhatsapp: true, currentBalanceCents: true, tenant: { select: { displayName: true } } },
    });
    if (debt === null) return;
    const phone = normalizeWhatsAppPhone(debt.debtorWhatsapp);
    if (phone === null) return;

    if (debt.currentBalanceCents <= 0n) {
      await this.sendPixCharge(tenantId, debtId, now);
      return;
    }

    const amount = calculatePartialPaymentCents(debt.currentBalanceCents, percentage);
    if (amount === 0n || amount < MIN_PARTIAL_PAYMENT_CENTS || debt.currentBalanceCents < MIN_PARTIAL_PAYMENT_CENTS) {
      await this.sendPixCharge(tenantId, debtId, now);
      return;
    }

    const charge = await this.paymentGateway?.createDebtCharge(tenantId, debtId, amount);
    if (charge === undefined || charge === null || charge.pixCopyPaste === null) {
      const body = renderCollectionMessage('collection.pix_unavailable', {});
      if (body === null) return;
      try {
        await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.pix_unavailable', now);
      } catch {
        // Melhor esforço.
      }
      return;
    }

    const remainingAmount = debt.currentBalanceCents - amount;
    const body = renderCollectionMessage('collection.partial_pix', {
      amount: formatMoneyCents(amount),
      pixCode: charge.pixCopyPaste,
      remainingAmount: formatMoneyCents(remainingAmount),
    });
    if (body === null) return;
    try {
      await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.partial_pix', now);
    } catch {
      // Melhor esforço — a cobrança já foi criada e continua válida mesmo se o envio falhar.
    }
  }

  /**
   * "Ver status do pagamento" (Fase 7) — só consulta o que já está
   * persistido (nenhum polling novo no provedor).
   */
  private async sendPaymentStatus(tenantId: bigint, debtId: bigint, now: Date): Promise<void> {
    const debt = await this.client.debt.findUnique({
      where: { id: debtId },
      select: { status: true, currentBalanceCents: true, debtorWhatsapp: true },
    });
    if (debt === null) return;
    const phone = normalizeWhatsAppPhone(debt.debtorWhatsapp);
    if (phone === null) return;

    if (debt.status === 'PAID') {
      const body = renderCollectionMessage('collection.payment_status_paid', {});
      if (body === null) return;
      try {
        await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.payment_status_paid', now);
      } catch {
        // Melhor esforço.
      }
      return;
    }

    const latestCharge = await this.client.paymentGatewayCharge.findFirst({
      where: { tenantId, debtId, originType: 'DEBT' },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });

    if (latestCharge !== null && (latestCharge.status === 'PENDING' || latestCharge.status === 'PROCESSING')) {
      const body = renderCollectionMessage('collection.payment_pending', {});
      if (body === null) return;
      try {
        await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.payment_pending', now);
      } catch {
        // Melhor esforço.
      }
      return;
    }

    const body = renderCollectionMessage('collection.payment_status_open', {
      amount: formatMoneyCents(debt.currentBalanceCents),
    });
    if (body === null) return;
    try {
      await this.sendImmediateReply(tenantId, debtId, phone, body, [], 'collection.payment_status_open', now);
    } catch {
      // Melhor esforço.
    }
  }
}
