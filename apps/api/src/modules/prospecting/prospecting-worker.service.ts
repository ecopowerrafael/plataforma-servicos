import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { type Environment } from '../../config/environment.js';
import { type ProspectingMessageSender } from './prospecting-message-sender.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { generateWorkerId } from './prospecting-worker-id.js';
import { ProspectingClaimRepository } from './prospecting-claim.repository.js';
import { type ProspectingWorker, type ProspectingWorkerRunResult } from './prospecting-worker.js';
import { ProspectingClock } from './prospecting-time.js';
import { ProspectingAutoReplyRepository } from './prospecting-auto-reply.repository.js';
import { ProspectingAutoReplyProcessor } from './prospecting-auto-reply-processor.js';
import { ProspectingInstanceRateLimit } from './prospecting-instance-rate-limit.js';

/**
 * Worker responsável por processar leads elegíveis de campanhas RUNNING.
 *
 * Fluxo:
 * 1. Localizar campanhas RUNNING
 * 2. Localizar leads elegíveis
 * 3. Fazer claim atômico
 * 4. Validar regras novamente
 * 5. Resolver template + variant
 * 6. Chamar sender
 * 7. Persistir ProspectingMessage
 * 8. Atualizar ProspectingLead
 * 9. Atualizar ProspectingCampaign nextSendAt
 * 10. Liberar lock
 */
export class ProspectingWorkerService implements ProspectingWorker {
  private readonly workerId: string;
  private readonly claimRepository: ProspectingClaimRepository;
  private readonly clock: ProspectingClock;
  private schedulerInterval: NodeJS.Timeout | undefined;

  public constructor(
    private readonly client: PrismaClient,
    private readonly environment: Environment,
    private readonly messageSender: ProspectingMessageSender,
    private readonly configService: ProspectingWhatsAppConfigService,
  ) {
    this.workerId = generateWorkerId();
    this.claimRepository = new ProspectingClaimRepository(client);
    this.clock = new ProspectingClock(this.environment.PROSPECTING_TIMEZONE);
  }

  public start(): void {
    if (!this.environment.PROSPECTING_WORKER_ENABLED) {
      console.log('[ProspectingWorker] Prospecting worker disabled');
      return;
    }

    const intervalSeconds = this.environment.PROSPECTING_WORKER_INTERVAL_SECONDS;
    console.log(`[ProspectingWorker] Starting scheduler (interval: ${intervalSeconds}s)`);

    this.schedulerInterval = setInterval(async () => {
      try {
        await this.runOnce();
      } catch (error) {
        console.error('[ProspectingWorker] Error in runOnce:', error);
      }
    }, intervalSeconds * 1000);
  }

  public async stop(): Promise<void> {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = undefined;
      console.log('[ProspectingWorker] Scheduler stopped');
    }
  }

  public async runOnce(): Promise<ProspectingWorkerRunResult> {
    const result: ProspectingWorkerRunResult = {
      campaignsChecked: 0,
      leadsClaimed: 0,
      sent: 0,
      dryRun: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
    };

    // Detectar mensagens SENDING stale (sem resposta após timeout)
    const staleThreshold = new Date(
      Date.now() - this.environment.PROSPECTING_SENDING_STALE_SECONDS * 1000,
    );
    const staleMessages = await this.client.prospectingMessage.findMany({
      where: {
        status: 'SENDING',
        sendingStartedAt: { lt: staleThreshold },
      },
    });

    for (const msg of staleMessages) {
      await this.client.prospectingMessage.update({
        where: { id: msg.id },
        data: {
          status: 'DELIVERY_UNCERTAIN',
          errorCode: 'DELIVERY_STATUS_UNKNOWN',
          errorMessage: 'Message delivery status unknown after timeout',
        },
      });

      // Lead fica bloqueado para este step até intervenção manual
      await this.client.prospectingLead.update({
        where: { id: msg.leadId },
        data: {
          status: 'NEEDS_REVIEW',
        },
      });
    }

    // Processar AUTO_REPLY pendentes (prioridade 1)
    if (this.environment.PROSPECTING_WORKER_ENABLED) {
      const autoReplyStats = await this.processAutoReplies();
      result.sent += autoReplyStats.sent;
      result.dryRun += autoReplyStats.dryRun;
      result.skipped += autoReplyStats.skipped;
      result.failed += autoReplyStats.failed;
      result.retried += autoReplyStats.retried;
    }

    // Buscar campanhas RUNNING
    const campaigns = await this.client.prospectingCampaign.findMany({
      where: { status: 'RUNNING' },
      include: {
        leads: {
          where: {
            // Leads elegíveis: PENDING, SCHEDULED, FOLLOW_UP
            status: { in: ['PENDING', 'SCHEDULED', 'FOLLOW_UP'] },
            // Sem lock ativo ou lock expirado E nextActionAt null ou já passou
            AND: [
              {
                OR: [
                  { processingWorkerId: null },
                  { processingExpiresAt: { lt: new Date() } },
                ],
              },
              {
                OR: [
                  { nextActionAt: null },
                  { nextActionAt: { lte: new Date() } },
                ],
              },
            ],
          },
          take: this.environment.PROSPECTING_WORKER_BATCH_SIZE,
        },
      },
    });

    result.campaignsChecked = campaigns.length;

    for (const campaign of campaigns) {
      for (const lead of campaign.leads) {
        try {
          // Claim atômico
          const claimResult = await this.claimRepository.claimLead(
            lead.id,
            this.workerId,
            this.environment.PROSPECTING_LOCK_TTL_SECONDS,
          );

          if (!claimResult.claimed) {
            result.skipped++;
            continue;
          }

          result.leadsClaimed++;

          // Revalidar regras após claim
          const isEligible = await this.validateLeadEligibility(lead, campaign);
          if (!isEligible) {
            result.skipped++;
            await this.claimRepository.releaseLead(lead.id, this.workerId);
            continue;
          }

          // Processar envio
          const sendResult = await this.processLeadSend(lead, campaign);

          // Atualizar resultado
          if (sendResult.status === 'sent') result.sent++;
          else if (sendResult.status === 'dry_run') result.dryRun++;
          else if (sendResult.status === 'retried') result.retried++;
          else if (sendResult.status === 'failed') result.failed++;

          // Liberar lock (sempre)
          await this.claimRepository.releaseLead(lead.id, this.workerId);
        } catch (error) {
          console.error(`[ProspectingWorker] Error processing lead ${lead.publicId}:`, error);
          result.failed++;
          await this.claimRepository.releaseLead(lead.id, this.workerId).catch(() => {});
        }
      }
    }

    return result;
  }

  private async validateLeadEligibility(lead: any, campaign: any): Promise<boolean> {
    // Verificar se campaign ainda está RUNNING
    if (campaign.status !== 'RUNNING') return false;

    // Verificar humanLock
    if (lead.humanLockUntil && lead.humanLockUntil > this.clock.now()) return false;

    // Verificar suppression
    const suppression = await this.client.prospectingSuppression.findFirst({
      where: {
        campaignId: campaign.id,
        normalizedPhone: lead.normalizedPhone,
      },
    });
    if (suppression) return false;

    // Verificar WhatsApp config ativa
    const config = await this.configService.getConfig();
    if (!config?.isActive) return false;

    // Verificar FlowExecution se campaign tem flow
    if (campaign.flowId) {
      const flowEnabled = this.environment.PROSPECTING_FLOW_ENABLED === true;
      if (!flowEnabled) {
        // Feature flag desativada, skip campaign com flow
        console.log(`[ProspectingWorker] Flow feature disabled, skipping lead ${lead.publicId} for campaign ${campaign.publicId}`);
        return false;
      }

      const execution = await this.client.prospectingFlowExecution.findUnique({
        where: {
          campaignId_leadId_flowId: {
            campaignId: campaign.id,
            leadId: lead.id,
            flowId: campaign.flowId,
          },
        },
      });

      // Se execution existe, deve estar ACTIVE para enviar (não WAITING/MANUAL/COMPLETED)
      if (execution && execution.status !== 'ACTIVE') {
        return false;
      }
      // Se execution não existe, ainda elegível (será criada em processLeadSend)
    }

    // Verificar janela de horário
    const allowedWeekdays = Array.isArray(campaign.allowedWeekdays)
      ? campaign.allowedWeekdays
      : JSON.parse(campaign.allowedWeekdays);

    const withinWindow = this.clock.isWithinSendingWindow(
      campaign.sendingStartMinutes,
      campaign.sendingEndMinutes,
    );
    if (!withinWindow) return false;

    // Verificar weekday
    const isAllowedDay = this.clock.isAllowedWeekday(allowedWeekdays);
    if (!isAllowedDay) return false;

    // Verificar dailyLimit usando timezone real
    const now = this.clock.now();
    const startOfDay = this.clock.startOfDay(now);
    const endOfDay = this.clock.endOfDay(now);

    const sentToday = await this.client.prospectingMessage.count({
      where: {
        campaignId: campaign.id,
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
        sentAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
    if (sentToday >= campaign.dailyLimit) return false;

    // Verificar rate limit da campanha
    if (campaign.nextSendAt && campaign.nextSendAt > now) return false;

    return true;
  }

  private async processLeadSend(lead: any, campaign: any): Promise<{ status: string }> {
    const isFlowMode = campaign.flowId && this.environment.PROSPECTING_FLOW_ENABLED;
    return isFlowMode ? this.processFlowLeadSend(lead, campaign) : this.processLegacyLeadSend(lead, campaign);
  }

  /**
   * FLOW MODE: Envio baseado em currentStep.message do FlowExecution.
   */
  private async processFlowLeadSend(lead: any, campaign: any): Promise<{ status: string }> {
    try {
      const now = this.clock.now();

      // TRANSACTION 1: PREPARE
      const prepareResult = await this.client.$transaction(async (tx) => {
        const reservedUntil = new Date(now.getTime() + this.getRandomInterval(campaign) * 1000);
        const slotReserved = await this.claimRepository.claimCampaignSendSlot(campaign.id, reservedUntil, now);
        if (!slotReserved) {
          throw new Error('CAMPAIGN_RATE_LIMITED');
        }

        // Find/create execution
        let execution = await tx.prospectingFlowExecution.findUnique({
          where: {
            campaignId_leadId_flowId: { campaignId: campaign.id, leadId: lead.id, flowId: campaign.flowId },
          },
          include: { currentStep: true },
        });

        if (!execution) {
          const startStep = await tx.prospectingFlowStep.findFirst({
            where: { flowId: campaign.flowId, isStart: true },
          });
          if (!startStep) throw new Error('START_STEP_NOT_FOUND');

          execution = await tx.prospectingFlowExecution.create({
            data: {
              publicId: randomUUID(),
              campaignId: campaign.id,
              leadId: lead.id,
              flowId: campaign.flowId,
              currentStepId: startStep.id,
              status: 'ACTIVE',
            },
            include: { currentStep: true },
          });
        }

        const step = execution.currentStep;
        const messageBody = await this.resolvePlaceholders(step.message, lead);
        const idempotencyKey = `flow:${execution.publicId}:step:${step.publicId}`;

        // Find/create message (flow mode: templateId=null)
        let msg = await tx.prospectingMessage.findFirst({
          where: { idempotencyKey },
        });

        let reconcile = false;
        if (!msg) {
          msg = await tx.prospectingMessage.create({
            data: {
              publicId: randomUUID(),
              campaignId: campaign.id,
              leadId: lead.id,
              direction: 'OUTBOUND',
              stepNumber: null,
              templateId: null,
              variantIndex: null,
              idempotencyKey,
              status: 'SENDING',
              sendingStartedAt: now,
              body: messageBody,
              attemptNumber: 1,
              purpose: 'FLOW',
            },
          });
        } else if (msg.status === 'SENT' || msg.status === 'DRY_RUN') {
          reconcile = true;
        } else if (msg.status === 'SENDING') {
          // SENDING existente: check age
          const age = now.getTime() - (msg.sendingStartedAt?.getTime() || now.getTime());
          const staleMs = this.environment.PROSPECTING_SENDING_STALE_SECONDS * 1000;
          if (age < staleMs) {
            throw new Error('SENDING_IN_PROGRESS');
          }
          // Deixar para política global marcar DELIVERY_UNCERTAIN
          throw new Error('SENDING_STALE');
        } else if (msg.status === 'DELIVERY_UNCERTAIN') {
          throw new Error('DELIVERY_UNCERTAIN_SKIP');
        } else if (msg.status !== 'FAILED') {
          throw new Error('MESSAGE_UNEXPECTED_STATUS');
        }

        if (msg.status === 'FAILED') {
          // Respeitar nextAttemptAt se ainda no futuro
          if (msg.nextAttemptAt && msg.nextAttemptAt > now) {
            throw new Error('FAILED_BACKOFF_PENDING');
          }

          // Max attempts?
          if (msg.attemptNumber >= this.environment.PROSPECTING_MAX_SEND_ATTEMPTS) {
            throw new Error('FAILED_MAX_ATTEMPTS');
          }

          // Reset para SENDING
          msg = await tx.prospectingMessage.update({
            where: { id: msg.id },
            data: {
              status: 'SENDING',
              attemptNumber: msg.attemptNumber + 1,
              sendingStartedAt: now,
              nextAttemptAt: null,
              errorCode: null,
              errorMessage: null,
              failedAt: null,
            },
          });
        }

        return { message: msg, execution, reconcile };
      }).catch(async (error) => {
        const errorStr = String(error);
        if (errorStr.includes('CAMPAIGN_RATE_LIMITED')) {
          return { message: null, execution: null, reconcile: false };
        }
        if (errorStr.includes('SENDING_IN_PROGRESS') || errorStr.includes('SENDING_STALE') ||
            errorStr.includes('FAILED_BACKOFF_PENDING') || errorStr.includes('FAILED_MAX_ATTEMPTS') ||
            errorStr.includes('DELIVERY_UNCERTAIN_SKIP')) {
          return { message: null, execution: null, reconcile: false };
        }
        console.error('[ProspectingWorker] Flow TX1 error:', error);
        throw error;
      });

      const { message, execution, reconcile } = prepareResult;
      if (!message || !execution) {
        return { status: 'skipped' };
      }

      // DRY RUN: não chamar provider
      if (this.environment.PROSPECTING_DRY_RUN) {
        await this.client.$transaction(async (tx) => {
          await tx.prospectingMessage.update({
            where: { id: message.id },
            data: { status: 'DRY_RUN' },
          });
          if (!reconcile) {
            await this.applyStepTransition(tx, execution);
          }
        });
        return { status: 'dry_run' };
      }

      // OUTSIDE TX: Call sender (se não reconcile)
      let sendResult: any = null;
      if (!reconcile) {
        sendResult = await this.messageSender.sendText({
          phone: lead.normalizedPhone,
          body: message.body,
        });
      }

      // TRANSACTION 2: RESULT + TRANSITION
      await this.client.$transaction(async (tx) => {
        if (reconcile) {
          await this.applyStepTransition(tx, execution);
          return;
        }

        if (!sendResult) throw new Error('SEND_RESULT_MISSING');

        if (sendResult.success) {
          await tx.prospectingMessage.update({
            where: { id: message.id },
            data: {
              status: 'SENT',
              externalMessageId: sendResult.externalMessageId || null,
              sentAt: now,
            },
          });

          await tx.prospectingLead.update({
            where: { id: lead.id },
            data: { status: 'SCHEDULED', lastOutboundAt: now, nextActionAt: now },
          });

          await this.applyStepTransition(tx, execution);
        } else if (sendResult.retryable) {
          const nextAttempt = message.attemptNumber;
          if (nextAttempt >= this.environment.PROSPECTING_MAX_SEND_ATTEMPTS) {
            await tx.prospectingMessage.update({
              where: { id: message.id },
              data: { status: 'FAILED', errorCode: sendResult.errorCode || null, errorMessage: sendResult.errorMessage || null, failedAt: now },
            });
            await tx.prospectingLead.update({
              where: { id: lead.id },
              data: { status: 'NEEDS_REVIEW' },
            });
          } else {
            const backoffMs = this.calculateBackoffMs(nextAttempt);
            const nextAttemptDate = new Date(now.getTime() + backoffMs);
            await tx.prospectingMessage.update({
              where: { id: message.id },
              data: {
                status: 'FAILED',
                errorCode: sendResult.errorCode || null,
                errorMessage: sendResult.errorMessage || null,
                failedAt: now,
                nextAttemptAt: nextAttemptDate,
              },
            });
            await tx.prospectingLead.update({
              where: { id: lead.id },
              data: { status: 'SCHEDULED', nextActionAt: nextAttemptDate },
            });
          }
        } else if (sendResult.errorCode === 'DELIVERY_UNCERTAIN') {
          await tx.prospectingLead.update({
            where: { id: lead.id },
            data: { status: 'NEEDS_REVIEW' },
          });
        } else {
          await tx.prospectingMessage.update({
            where: { id: message.id },
            data: { status: 'FAILED', errorCode: sendResult.errorCode || null, errorMessage: sendResult.errorMessage || null, failedAt: now },
          });
          await tx.prospectingLead.update({
            where: { id: lead.id },
            data: { status: 'NEEDS_REVIEW' },
          });
        }
      });

      if (this.environment.PROSPECTING_DRY_RUN) return { status: 'dry_run' };
      if (reconcile || (sendResult && sendResult.success)) return { status: 'sent' };
      if (sendResult && sendResult.retryable && message.attemptNumber < this.environment.PROSPECTING_MAX_SEND_ATTEMPTS) return { status: 'retried' };
      return { status: 'failed' };
    } catch (error) {
      console.error(`[ProspectingWorker] Flow error:`, error);
      return { status: 'failed' };
    }
  }

  /**
   * LEGACY MODE: Envio baseado em templates e variants.
   */
  private async processLegacyLeadSend(lead: any, campaign: any): Promise<{ status: string }> {
    try {
      const now = this.clock.now();

      const prepareResult = await this.client.$transaction(async (tx) => {
        const reservedUntil = new Date(now.getTime() + this.getRandomInterval(campaign) * 1000);
        const slotReserved = await this.claimRepository.claimCampaignSendSlot(campaign.id, reservedUntil, now);
        if (!slotReserved) throw new Error('CAMPAIGN_RATE_LIMITED');

        const template = await tx.prospectingTemplate.findFirst({
          where: { campaignId: campaign.id, stepNumber: lead.currentStep },
          include: { variants: { orderBy: { variantIndex: 'asc' } } },
        });
        if (!template) throw new Error('TEMPLATE_NOT_FOUND');

        const variantIndex = this.selectVariantDeterministic(lead.publicId, template.publicId, template.variants.length);
        const variant = template.variants[variantIndex];
        if (!variant) throw new Error('VARIANT_NOT_FOUND');

        const messageBody = await this.resolvePlaceholders(variant.body, lead);
        const idempotencyKey = `campaign:${campaign.publicId}:lead:${lead.publicId}:step:${lead.currentStep}`;

        let msg = await tx.prospectingMessage.findFirst({
          where: { idempotencyKey },
        });

        let reconcile = false;
        if (!msg) {
          msg = await tx.prospectingMessage.create({
            data: {
              publicId: randomUUID(),
              campaignId: campaign.id,
              leadId: lead.id,
              direction: 'OUTBOUND',
              stepNumber: lead.currentStep,
              templateId: template.id,
              variantIndex,
              idempotencyKey,
              status: 'SENDING',
              sendingStartedAt: now,
              body: messageBody,
              attemptNumber: lead.attemptCount + 1,
            },
          });
        } else if (msg.status === 'SENT') {
          reconcile = true;
        } else if (msg.status !== 'SENDING' && msg.status !== 'FAILED') {
          throw new Error('MESSAGE_UNEXPECTED_STATUS');
        }

        if (msg.status === 'FAILED') {
          msg = await tx.prospectingMessage.update({
            where: { id: msg.id },
            data: {
              status: 'SENDING',
              attemptNumber: msg.attemptNumber + 1,
              sendingStartedAt: now,
              errorCode: null,
              errorMessage: null,
              failedAt: null,
            },
          });
        }

        return { message: msg, reconcile };
      }).catch(async (error) => {
        if (String(error).includes('CAMPAIGN_RATE_LIMITED')) {
          return { message: null, reconcile: false };
        }
        throw error;
      });

      const { message, reconcile } = prepareResult;
      if (!message) return { status: 'skipped' };

      let sendResult: any = null;
      if (!reconcile && !this.environment.PROSPECTING_DRY_RUN) {
        sendResult = await this.messageSender.sendText({
          phone: lead.normalizedPhone,
          body: message.body,
        });
      }

      await this.client.$transaction(async (tx) => {
        if (this.environment.PROSPECTING_DRY_RUN) {
          await tx.prospectingMessage.update({
            where: { id: message.id },
            data: { status: 'DRY_RUN' },
          });
          return;
        }

        if (reconcile) {
          return;
        }

        if (!sendResult) throw new Error('SEND_RESULT_MISSING');

        if (sendResult.success) {
          await tx.prospectingMessage.update({
            where: { id: message.id },
            data: { status: 'SENT', externalMessageId: sendResult.externalMessageId || null, sentAt: now },
          });
          await tx.prospectingLead.update({
            where: { id: lead.id },
            data: { status: 'WAITING_REPLY', lastOutboundAt: now, attemptCount: lead.attemptCount + 1 },
          });
        } else if (sendResult.retryable) {
          const nextAttempt = message.attemptNumber;
          if (nextAttempt >= this.environment.PROSPECTING_MAX_SEND_ATTEMPTS) {
            await tx.prospectingMessage.update({
              where: { id: message.id },
              data: { status: 'FAILED', errorCode: sendResult.errorCode || null, errorMessage: sendResult.errorMessage || null, failedAt: now },
            });
            await tx.prospectingLead.update({
              where: { id: lead.id },
              data: { status: 'NEEDS_REVIEW' },
            });
          } else {
            const backoffMs = this.calculateBackoffMs(nextAttempt);
            await tx.prospectingMessage.update({
              where: { id: message.id },
              data: { status: 'FAILED', errorCode: sendResult.errorCode || null, errorMessage: sendResult.errorMessage || null, failedAt: now },
            });
            await tx.prospectingLead.update({
              where: { id: lead.id },
              data: { status: 'SCHEDULED', nextActionAt: new Date(now.getTime() + backoffMs) },
            });
            await tx.prospectingCampaign.update({
              where: { id: campaign.id },
              data: { nextSendAt: new Date(now.getTime() + campaign.minIntervalSeconds * 1000) },
            });
          }
        } else {
          await tx.prospectingMessage.update({
            where: { id: message.id },
            data: { status: 'FAILED', errorCode: sendResult.errorCode || null, errorMessage: sendResult.errorMessage || null, failedAt: now },
          });
          await tx.prospectingLead.update({
            where: { id: lead.id },
            data: { status: 'NEEDS_REVIEW' },
          });
        }
      });

      if (this.environment.PROSPECTING_DRY_RUN) return { status: 'dry_run' };
      if (reconcile || (sendResult && sendResult.success)) return { status: 'sent' };
      if (sendResult && sendResult.retryable && message.attemptNumber < this.environment.PROSPECTING_MAX_SEND_ATTEMPTS) return { status: 'retried' };
      return { status: 'failed' };
    } catch (error) {
      console.error(`[ProspectingWorker] Legacy error:`, error);
      return { status: 'failed' };
    }
  }

  /**
   * Aplicar transição de step no fluxo (todos os stepTypes).
   */
  private async applyStepTransition(tx: any, execution: any): Promise<void> {
    const step = execution.currentStep;

    switch (step.stepType) {
      case 'MESSAGE_OPTIONS':
      case 'WAIT_TEXT':
      case 'WAIT_LINK':
        // Aguardar resposta: execution WAITING, lead WAITING_REPLY
        await tx.prospectingFlowExecution.update({
          where: { id: execution.id },
          data: { status: 'WAITING' },
        });
        await tx.prospectingLead.update({
          where: { id: execution.leadId },
          data: { status: 'WAITING_REPLY', nextActionAt: null },
        });
        break;

      case 'MESSAGE_ONLY':
        if (step.nextStepId) {
          await tx.prospectingFlowExecution.update({
            where: { id: execution.id },
            data: { currentStepId: step.nextStepId, status: 'ACTIVE' },
          });
          await tx.prospectingLead.update({
            where: { id: execution.leadId },
            data: { status: 'SCHEDULED', nextActionAt: new Date() },
          });
        } else {
          await tx.prospectingFlowExecution.update({
            where: { id: execution.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          await tx.prospectingLead.update({
            where: { id: execution.leadId },
            data: { nextActionAt: null },
          });
        }
        break;

      case 'MANUAL':
        await tx.prospectingFlowExecution.update({
          where: { id: execution.id },
          data: { status: 'MANUAL' },
        });
        await tx.prospectingLead.update({
          where: { id: execution.leadId },
          data: {
            humanLockUntil: new Date(Date.now() + 30 * 24 * 3600_000),
            humanLockType: 'FLOW_MANUAL',
            humanLockReason: 'Flow step requires manual intervention',
            nextActionAt: null,
          },
        });
        break;

      case 'END':
        await tx.prospectingFlowExecution.update({
          where: { id: execution.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await tx.prospectingLead.update({
          where: { id: execution.leadId },
          data: { nextActionAt: null },
        });
        break;
    }
  }

  private selectVariantDeterministic(leadPublicId: string, templatePublicId: string, variantCount: number): number {
    if (variantCount === 0) return 0;
    const combined = `${leadPublicId}:${templatePublicId}`;
    const hash = combined.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return hash % variantCount;
  }

  private async resolvePlaceholders(body: string, lead: any): Promise<string> {
    let resolved = body;

    // Buscar business para dados adicionais
    const business = await this.client.directoryBusiness.findUnique({
      where: { id: lead.directoryBusinessId },
      select: { name: true, city: true, state: true },
    });

    resolved = resolved.replace(/\{\{nome\}\}/g, lead.nameSnapshot || '');
    resolved = resolved.replace(/\{\{empresa\}\}/g, business?.name || '');
    resolved = resolved.replace(/\{\{cidade\}\}/g, business?.city || '');
    resolved = resolved.replace(/\{\{estado\}\}/g, business?.state || '');

    return resolved;
  }

  private getRandomInterval(campaign: any): number {
    const min = campaign.minIntervalSeconds;
    const max = campaign.maxIntervalSeconds;
    return min + Math.random() * (max - min);
  }

  private calculateBackoffMs(attemptNumber: number): number {
    const baseMs = [60_000, 300_000, 900_000, 1_800_000]; // 1, 5, 15, 30 min
    const jitterMs = Math.random() * 30_000; // ±30s jitter
    const index = Math.min(attemptNumber - 1, baseMs.length - 1);
    return baseMs[index]! + jitterMs;
  }


  /**
   * Processar AUTO_REPLY pendentes (prioridade máxima).
   */
  private async processAutoReplies(): Promise<{ sent: number; dryRun: number; skipped: number; failed: number; retried: number }> {
    const stats = { sent: 0, dryRun: 0, skipped: 0, failed: 0, retried: 0 };

    if (!this.configService) {
      return stats;
    }

    const repo = new ProspectingAutoReplyRepository(this.client);
    const processor = new ProspectingAutoReplyProcessor(this.client);
    const rateLimiter = new ProspectingInstanceRateLimit(this.client);

    const now = new Date();
    const startOfDay = this.clock.startOfDay(now);

    // Buscar AUTO_REPLY pendentes
    const pendingAutoReplies = await repo.findPendingAutoReplies(this.environment.PROSPECTING_WORKER_BATCH_SIZE);

    for (const message of pendingAutoReplies) {
      // Validar se ainda pode enviar
      if (!message.objectionId) {
        // Sem objection definida, cancelar
        await repo.cancelMessage(message.id, 'NO_OBJECTION');
        stats.skipped++;
        continue;
      }

      const validation = await processor.validateAutoReply({
        messageId: message.id,
        campaignId: message.campaignId,
        leadId: message.leadId,
        objectionId: message.objectionId,
        maxSendAttempts: this.environment.PROSPECTING_MAX_SEND_ATTEMPTS,
        maxAutoRepliesPerDay: 100, // Configurável depois
        maxAutoRepliesPerLead: 3, // Configurável depois
        autoReplyCooldownSeconds: 60, // Configurável depois
        dryRun: this.environment.PROSPECTING_DRY_RUN,
        startOfDay,
        now,
      });

      if (!validation.valid) {
        // Cancelar mensagem
        if (validation.cancelReason === 'COOLDOWN') {
          // Reagendar em vez de cancelar
          await processor.rescheduleForCooldown(message.id, 60, now);
          stats.retried++;
        } else {
          await repo.cancelMessage(message.id, validation.cancelReason || 'VALIDATION_FAILED');
          stats.skipped++;
        }
        continue;
      }

      // Em dry-run, não chamar provider nem ocupar slot
      if (this.environment.PROSPECTING_DRY_RUN) {
        await this.client.prospectingMessage.update({
          where: { id: message.id },
          data: {
            status: 'DRY_RUN',
          },
        });
        stats.dryRun++;
        continue;
      }

      // Tentar fazer claim do slot global da instância
      const config = await this.configService.getConfig();
      if (!config) {
        stats.skipped++;
        continue;
      }

      const slotDuration = 2; // segundos
      const reservedUntil = new Date(now.getTime() + slotDuration * 1000);
      const slotClaimed = await rateLimiter.claimSendSlot(config.instanceId, reservedUntil, now);

      if (!slotClaimed) {
        // Slot ocupado, manter PENDING para próxima tentativa
        stats.skipped++;
        continue;
      }

      try {
        // Marcar como SENDING
        await repo.markSending(message.id);

        // Chamar sender
        const sendResult = await this.messageSender.sendText({
          phone: (message.lead as any).phoneSnapshot || (message.lead as any).normalizedPhone,
          body: message.body,
        });

        // Sucesso
        if (sendResult.success) {
          await processor.handleSuccess(message.id, sendResult.externalMessageId || undefined);
          stats.sent++;
        } else if (sendResult.retryable) {
          // Falha retryable
          const backoffMs = this.calculateBackoffMs(message.attemptNumber);
          await processor.handleRetryable(
            message.id,
            message.attemptNumber,
            this.environment.PROSPECTING_MAX_SEND_ATTEMPTS,
            backoffMs / 1000,
            now,
          );
          stats.retried++;
        } else {
          // Falha definitiva
          const errorMsg = sendResult.errorMessage || 'Unknown error';
          await processor.handleDefinitiveFailure(message.id, errorMsg);
          stats.failed++;
        }
      } catch (error) {
        // Erro inesperado
        await processor.handleDefinitiveFailure(message.id, `Unexpected error: ${String(error)}`);
        stats.failed++;
      }
      // Nota: nextSendAt NÃO é limpo. É um rate-limit persistente.
      // Próximos outbounds só conseguem quando now >= nextSendAt.
    }

    return stats;
  }
}
