import { type TreatmentPlanReminderRepository } from './treatment-plan-reminder.repository.js';
import { type IntegrationRepository } from '../integrations/integration.repository.js';
import { AppError } from '../../errors/AppError.js';

export class TreatmentPlanReminderService {
  public constructor(
    private readonly reminderRepo: TreatmentPlanReminderRepository,
    private readonly integrationRepo: IntegrationRepository,
  ) {}

  async initializeForPendingPlan(tenantId: bigint, treatmentPlanId: bigint): Promise<void> {
    const existing = await this.reminderRepo.getByTreatmentPlanId(treatmentPlanId);
    if (existing !== null) return;

    const config = await this.reminderRepo.getConfig(tenantId);
    if (config === null || !config.enabled) return;

    const sequence = config.sequence as any[];
    if (!Array.isArray(sequence) || sequence.length === 0) return;

    const now = new Date();
    const nextReminderAt = this.calculateNextReminderTime(now, sequence[0]);

    await this.reminderRepo.createReminderState({
      tenantId,
      treatmentPlanId,
      nextReminderAt,
      status: 'ACTIVE',
      channel: config.channel,
      currentStepIndex: 0,
    });
  }

  async cancelReminder(treatmentPlanId: bigint): Promise<void> {
    const state = await this.reminderRepo.getByTreatmentPlanId(treatmentPlanId);
    if (state === null) return;

    await this.reminderRepo.updateReminderState(state.id, {
      status: 'CANCELED',
      nextReminderAt: null,
    });
  }

  async pauseReminder(treatmentPlanId: bigint): Promise<void> {
    const state = await this.reminderRepo.getByTreatmentPlanId(treatmentPlanId);
    if (state === null) return;

    await this.reminderRepo.updateReminderState(state.id, {
      status: 'PAUSED',
    });
  }

  async resumeReminder(treatmentPlanId: bigint): Promise<void> {
    const state = await this.reminderRepo.getByTreatmentPlanId(treatmentPlanId);
    if (state === null) return;

    const config = await this.reminderRepo.getConfig(state.tenantId);
    if (config === null || !config.enabled) return;

    const sequence = config.sequence as any[];
    const now = new Date();
    const step = Array.isArray(sequence) ? sequence[state.currentStepIndex] : null;
    const nextReminderAt = step ? this.calculateNextReminderTime(now, step) : null;

    await this.reminderRepo.updateReminderState(state.id, {
      status: 'ACTIVE',
      nextReminderAt,
    });
  }

  async sendManualReminder(treatmentPlanId: bigint): Promise<void> {
    const state = await this.reminderRepo.getByTreatmentPlanId(treatmentPlanId);
    if (state === null) throw new AppError({
      code: 'REMINDER_STATE_NOT_FOUND',
      message: 'Estado de lembrete não encontrado.',
      statusCode: 404,
    });

    const plan = await this.reminderRepo.getTreatmentPlan(treatmentPlanId);
    if (plan === null || plan.status !== 'PENDING') throw new AppError({
      code: 'INVALID_TREATMENT_PLAN_STATUS',
      message: 'Orçamento não está em status pendente.',
      statusCode: 400,
    });

    const config = await this.reminderRepo.getConfig(state.tenantId);
    if (config === null || !config.enabled) throw new AppError({
      code: 'REMINDERS_DISABLED',
      message: 'Lembretes estão desativados.',
      statusCode: 400,
    });

    const sequence = config.sequence as any[];
    if (!Array.isArray(sequence)) throw new AppError({
      code: 'INVALID_REMINDER_SEQUENCE',
      message: 'Sequência de lembretes inválida.',
      statusCode: 400,
    });

    const step = sequence[state.currentStepIndex];
    if (!step) throw new AppError({
      code: 'INVALID_REMINDER_STEP',
      message: 'Etapa do lembrete inválida.',
      statusCode: 400,
    });

    await this.sendReminder(state, plan, config, step);

    await this.reminderRepo.createReminderLog({
      tenantId: state.tenantId,
      reminderStateId: state.id,
      stepIndex: state.currentStepIndex,
      channel: state.channel,
      messageTemplate: step.message,
      sentMessage: '', // Will be populated during send
      status: 'SENT',
      errorMessage: null,
    });
  }

  async processDueReminders(): Promise<void> {
    const dueReminders = await this.reminderRepo.getDueReminders();

    for (const state of dueReminders) {
      try {
        const plan = await this.reminderRepo.getTreatmentPlan(state.treatmentPlanId);
        if (plan === null || plan.status !== 'PENDING') {
          await this.cancelReminder(state.treatmentPlanId);
          continue;
        }

        const config = await this.reminderRepo.getConfig(state.tenantId);
        if (config === null || !config.enabled) {
          await this.cancelReminder(state.treatmentPlanId);
          continue;
        }

        const sequence = config.sequence as any[];
        const step = Array.isArray(sequence) ? sequence[state.currentStepIndex] : null;
        if (!step) {
          await this.reminderRepo.updateReminderState(state.id, { status: 'COMPLETED' });
          continue;
        }

        if (!step.enabled) {
          await this.advanceToNextStep(state, config);
          continue;
        }

        await this.sendReminder(state, plan, config, step);
        await this.advanceToNextStep(state, config);
      } catch (error) {
        // Log error and continue with next reminder
        const err = error instanceof Error ? error.message : 'Unknown error';
        await this.reminderRepo.createReminderLog({
          tenantId: state.tenantId,
          reminderStateId: state.id,
          stepIndex: state.currentStepIndex,
          channel: state.channel,
          messageTemplate: '',
          sentMessage: '',
          status: 'FAILED',
          errorMessage: err.substring(0, 500),
        });
      }
    }
  }

  private async sendReminder(
    state: any,
    plan: any,
    _config: any,
    step: any,
  ): Promise<void> {
    if (state.channel !== 'WHATSAPP') {
      throw new AppError({
        code: 'CHANNEL_NOT_SUPPORTED',
        message: 'Canal de envio não suportado.',
        statusCode: 400,
      });
    }

    const whatsappConfig = await this.integrationRepo.whatsapp(state.tenantId);
    if (whatsappConfig === null || !whatsappConfig.active) {
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp não configurado.',
        statusCode: 400,
      });
    }

    const tenant = await this.reminderRepo.getTenant(state.tenantId);
    if (tenant === null) throw new AppError({
      code: 'TENANT_NOT_FOUND',
      message: 'Estabelecimento não encontrado.',
      statusCode: 404,
    });

    const terminology = await this.reminderRepo.getTenantTerminology(state.tenantId);

    const sentMessage = this.renderMessage(step.message, {
      customerName: plan.customer.name,
      treatmentPlanSingular: terminology?.treatmentPlanSingular ?? 'Orçamento',
      treatmentTitle: plan.title ?? plan.service.name,
      professionalName: plan.professional.publicName,
      amount: this.formatCurrency(plan.amountCents, tenant.currency),
      tenantName: tenant.displayName,
    });

    const phone = plan.customer.phone;
    if (!phone) {
      throw new AppError({
        code: 'CUSTOMER_PHONE_NOT_FOUND',
        message: 'Telefone do cliente não disponível.',
        statusCode: 400,
      });
    }

    // TODO: Integração com delivery será feita pela infraestrutura do tenant
    // Por enquanto, apenas registra o log como enviado
    await this.reminderRepo.createReminderLog({
      tenantId: state.tenantId,
      reminderStateId: state.id,
      stepIndex: state.currentStepIndex,
      channel: state.channel,
      messageTemplate: step.message,
      sentMessage,
      status: 'SENT',
      errorMessage: null,
    });

    await this.reminderRepo.updateReminderState(state.id, {
      lastReminderAt: new Date(),
      remindersSent: state.remindersSent + 1,
    });
  }

  private async advanceToNextStep(state: any, config: any): Promise<void> {
    const nextIndex = state.currentStepIndex + 1;
    const sequence = config.sequence as any[];
    const nextStep = Array.isArray(sequence) ? sequence[nextIndex] : null;

    if (!nextStep) {
      await this.reminderRepo.updateReminderState(state.id, {
        status: 'COMPLETED',
        nextReminderAt: null,
        currentStepIndex: nextIndex,
      });
      return;
    }

    const now = new Date();
    const nextReminderAt = this.calculateNextReminderTime(now, nextStep);

    await this.reminderRepo.updateReminderState(state.id, {
      nextReminderAt,
      currentStepIndex: nextIndex,
    });
  }

  private calculateNextReminderTime(baseTime: Date, step: any): Date {
    const copy = new Date(baseTime);
    if (step.delayUnit === 'HOUR') {
      copy.setUTCHours(copy.getUTCHours() + step.delayValue);
    } else if (step.delayUnit === 'DAY') {
      copy.setUTCDate(copy.getUTCDate() + step.delayValue);
    }
    return copy;
  }

  private renderMessage(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = vars[key];
      return value !== undefined ? value : `{{${key}}}`;
    });
  }

  private formatCurrency(cents: bigint, currency: string): string {
    const amount = Number(cents) / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(amount);
  }
}
