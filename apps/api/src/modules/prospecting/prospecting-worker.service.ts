import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { type Environment } from '../../config/environment.js';
import { type ProspectingMessageSender } from './prospecting-message-sender.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { generateWorkerId } from './prospecting-worker-id.js';
import { ProspectingClaimRepository } from './prospecting-claim.repository.js';
import { type ProspectingWorker, type ProspectingWorkerRunResult } from './prospecting-worker.js';

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
  private schedulerInterval: NodeJS.Timeout | undefined;

  public constructor(
    private readonly client: PrismaClient,
    private readonly environment: Environment,
    private readonly messageSender: ProspectingMessageSender,
    private readonly configService: ProspectingWhatsAppConfigService,
  ) {
    this.workerId = generateWorkerId();
    this.claimRepository = new ProspectingClaimRepository(client);
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
    if (lead.humanLockUntil && lead.humanLockUntil > new Date()) return false;

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

    // Verificar janela de horário e weekday
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < campaign.sendingStartMinutes || nowMinutes > campaign.sendingEndMinutes) return false;

    const allowedWeekdays = Array.isArray(campaign.allowedWeekdays)
      ? campaign.allowedWeekdays
      : JSON.parse(campaign.allowedWeekdays);
    const dayOfWeek = (now.getDay() + 6) % 7 + 1; // Domingo=7, Segunda=1
    if (!allowedWeekdays.includes(dayOfWeek)) return false;

    // Verificar dailyLimit
    const sentToday = await this.client.prospectingMessage.count({
      where: {
        campaignId: campaign.id,
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
        sentAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lte: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
      },
    });
    if (sentToday >= campaign.dailyLimit) return false;

    // Verificar rate limit da campanha
    if (campaign.nextSendAt && campaign.nextSendAt > new Date()) return false;

    return true;
  }

  private async processLeadSend(lead: any, campaign: any): Promise<{ status: string }> {
    try {
      // Buscar template
      const template = await this.client.prospectingTemplate.findFirst({
        where: {
          campaignId: campaign.id,
          stepNumber: lead.currentStep,
        },
        include: {
          variants: {
            orderBy: { variantIndex: 'asc' },
          },
        },
      });

      if (!template) {
        await this.updateLeadFailed(lead.id, 'TEMPLATE_NOT_FOUND', 'Template não encontrado');
        return { status: 'failed' };
      }

      // Selecionar variant (determinística)
      const variantIndex = this.selectVariantDeterministic(lead.publicId, template.publicId, template.variants.length);
      const variant = template.variants[variantIndex];

      if (!variant) {
        await this.updateLeadFailed(lead.id, 'VARIANT_NOT_FOUND', 'Variante não encontrada');
        return { status: 'failed' };
      }

      // Resolver placeholders
      const messageBody = await this.resolvePlaceholders(variant.body, lead);

      // Criar ProspectingMessage SENDING com idempotencyKey
      const idempotencyKey = `${campaign.publicId}:${lead.publicId}:${lead.currentStep}`;

      let message = await this.client.prospectingMessage.findFirst({
        where: { idempotencyKey },
      });

      if (!message) {
        message = await this.client.prospectingMessage.create({
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
            sendingStartedAt: new Date(),
            body: messageBody,
            attemptNumber: lead.attemptCount + 1,
          },
        });
      } else if (message.status !== 'SENDING') {
        // Já foi processado
        return { status: 'skipped' };
      }

      // Chamar sender
      const sendResult = await this.messageSender.sendText({
        phone: lead.normalizedPhone,
        body: messageBody,
      });

      // Atualizar mensagem e lead conforme resultado
      if (this.environment.PROSPECTING_DRY_RUN) {
        // DRY RUN
        await this.client.prospectingMessage.update({
          where: { id: message.id },
          data: {
            status: 'DRY_RUN',
            externalMessageId: null,
          },
        });
        return { status: 'dry_run' };
      }

      if (sendResult.success) {
        // Sucesso
        const now = new Date();
        await this.client.$transaction([
          this.client.prospectingMessage.update({
            where: { id: message.id },
            data: {
              status: 'SENT',
              externalMessageId: sendResult.externalMessageId,
              sentAt: now,
            },
          }),
          this.client.prospectingLead.update({
            where: { id: lead.id },
            data: {
              status: 'WAITING_REPLY',
              lastOutboundAt: now,
              attemptCount: lead.attemptCount + 1,
            },
          }),
          this.client.prospectingCampaign.update({
            where: { id: campaign.id },
            data: {
              nextSendAt: new Date(now.getTime() + this.getRandomInterval(campaign) * 1000),
            },
          }),
        ]);
        return { status: 'sent' };
      }

      if (sendResult.retryable) {
        // Retryable
        const nextAttempt = lead.attemptCount + 1;
        if (nextAttempt >= this.environment.PROSPECTING_MAX_SEND_ATTEMPTS) {
          // Max attempts reached
          await this.updateLeadFailed(lead.id, sendResult.errorCode, sendResult.errorMessage);
          return { status: 'failed' };
        }

        // Calcular próximo retry
        const backoffMs = this.calculateBackoffMs(nextAttempt);
        await this.client.$transaction([
          this.client.prospectingMessage.update({
            where: { id: message.id },
            data: {
              status: 'FAILED',
              errorCode: sendResult.errorCode || null,
              errorMessage: sendResult.errorMessage || null,
              failedAt: new Date(),
            },
          }),
          this.client.prospectingLead.update({
            where: { id: lead.id },
            data: {
              attemptCount: nextAttempt,
              nextActionAt: new Date(Date.now() + backoffMs),
            },
          }),
        ]);
        return { status: 'retried' };
      }

      // Não retryable
      await this.updateLeadFailed(lead.id, sendResult.errorCode, sendResult.errorMessage);
      return { status: 'failed' };
    } catch (error) {
      console.error(`[ProspectingWorker] Error sending message:`, error);
      await this.updateLeadFailed(lead.id, 'INTERNAL_ERROR', String(error));
      return { status: 'failed' };
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

  private async updateLeadFailed(_leadId: bigint, _errorCode?: string, _errorMessage?: string): Promise<void> {
    // TODO: Persistir erro na lead se necessário
    // Por enquanto apenas marcar como FAILED
    // await this.client.prospectingLead.update({
    //   where: { id: leadId },
    //   data: {
    //     status: 'FAILED',
    //   },
    // });
  }
}
