import { isCollectionAction } from './collection-actions.js';
import { formatDueDate, formatMoneyCents, renderCollectionMessage } from './collection-attempt-templates.js';
import { type DebtService } from './debt.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { type NotificationService } from '../notifications/notification.service.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';
import { resolveTimezone } from '../tenants/timezone.js';

const COLLECTION_BUTTONS = [
  { actionKey: 'COLLECTION_PAY_FULL', label: 'Pagar valor total', enabled: true, order: 0 },
  { actionKey: 'COLLECTION_NEED_MORE_TIME', label: 'Preciso de mais prazo', enabled: true, order: 1 },
  { actionKey: 'COLLECTION_HUMAN_SUPPORT', label: 'Falar com atendimento', enabled: true, order: 2 },
];

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

/** Retorna o motivo do bloqueio, ou null se a Debt pode receber cobrança agora. */
function debtBlockReason(debt: DebtForSend): string | null {
  if (debt.status === 'PAUSED') return 'DEBT_PAUSED';
  if (debt.status === 'HUMAN_SUPPORT') return 'DEBT_HUMAN_SUPPORT';
  if (debt.status === 'DISPUTED') return 'DEBT_DISPUTED';
  if (debt.status === 'PAID') return 'DEBT_PAID';
  if (debt.status === 'CANCELED') return 'DEBT_CANCELED';
  if (debt.status !== 'OPEN') return 'DEBT_STATUS_NOT_COLLECTIBLE';
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

    const blockReason = debtBlockReason(debt);
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

    await this.notifications.enqueue(
      debt.tenantId,
      {
        channel: 'WHATSAPP',
        kind: attempt.templateKey,
        targetType: 'collection_attempt',
        targetPublicId: attempt.publicId,
        recipient: phone,
        subject: 'Cobrança em aberto',
        body,
        whatsappButtons: COLLECTION_BUTTONS,
      },
      now,
    );

    const log = await this.client.notificationLog.findFirst({
      where: {
        tenantId: debt.tenantId,
        kind: attempt.templateKey,
        targetType: 'collection_attempt',
        targetPublicId: attempt.publicId,
        channel: 'WHATSAPP',
        recipient: phone,
      },
    });
    if (log === null) throw new Error('NotificationLog não encontrado após enqueue.');

    try {
      await this.notifications.retry(debt.tenantId, log.publicId);
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

    if (refreshed.status === 'SENT') {
      await this.client.collectionAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SENT',
          sentAt: refreshed.sentAt ?? now,
          notificationLogId: log.id,
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
        data: { status: 'FAILED', lastError: 'WHATSAPP_NOT_CONFIGURED', notificationLogId: log.id },
      });
      return 'failed';
    }

    // FAILED: erro transitório do provider — retry técnico, não avança o ciclo.
    const retried = await this.registerTechnicalFailure(
      attempt.id,
      attempt.technicalRetryCount,
      now,
      refreshed.lastError,
      log.id,
    );
    if (retried) return 'retried';

    await this.debts.recordEvent(debt.tenantId, debt.id, 'COLLECTION_ATTEMPT_FAILED', {
      collectionAttemptPublicId: attempt.publicId,
      templateKey: attempt.templateKey,
    });
    return 'failed';
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
        data: { status: 'RESPONDED', respondedAt: new Date() },
      });
    }
    await this.debts.recordEvent(tenantId, attempt.debtId, 'COLLECTION_RESPONSE_RECEIVED', { actionId });

    if (actionId === 'COLLECTION_HUMAN_SUPPORT') {
      await this.debts.markHumanSupport(tenantId, attempt.debtId);
      await this.client.collectionAttempt.updateMany({
        where: { tenantId, debtId: attempt.debtId, status: 'SCHEDULED' },
        data: { status: 'CANCELED', skippedAt: new Date(), skipReason: 'HUMAN_SUPPORT_REQUESTED' },
      });
    }

    return { handled: true };
  }
}
